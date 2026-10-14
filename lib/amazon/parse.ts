import * as cheerio from "cheerio";

export type AmazonProduct = {
  rank: number;
  asin: string;
  title: string;
  url: string;
  image?: string;
  price?: number;
  rating?: number;
  reviews?: number;
  /** Movers & Shakers: creșterea în clasament, în % */
  rankChangePct?: number;
};

const ASIN_RE = /^(B0[A-Z0-9]{8}|\d{9}[\dX])$/;

function num(s?: string): number | undefined {
  if (!s) return undefined;
  let t = s.replace(/[^\d.,]/g, "");
  if (!t) return undefined;
  if (t.includes(",") && t.includes(".")) t = t.lastIndexOf(",") > t.lastIndexOf(".") ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  else if (t.includes(",")) t = /,\d{3}$/.test(t) ? t.replace(/,/g, "") : t.replace(",", ".");
  else if (/\.\d{3}$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

/** Textul elementului cu spații între noduri (altfel „1.234” și „19,99 €” se lipesc). */
function spacedText(card: cheerio.Cheerio<any>): string {
  return card.find("*").addBack().contents().toArray()
    .filter(n => n.type === "text").map(n => (n as unknown as { data: string }).data).join(" ").replace(/\s+/g, " ");
}

/** Ultimul număr întreg dintr-un text („4,6 von 5 Sternen 12.345” → 12345). */
function lastCount(text: string): number | undefined {
  const all = text.replace(/\d[.,]\d\s*(?:out of|von|de)\s*5[^\d]*/gi, " ").match(/\d{1,3}(?:[.,]\d{3})+|\d+/g);
  return all ? Number(all[all.length - 1].replace(/[.,]/g, "")) : undefined;
}

const PRICE_RE = /[£€]\s?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?|\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\s?€/;

/** Parsează pagini Amazon Best Sellers / Movers & Shakers (UK și DE). */
export function parseAmazonList(html: string, host: string): AmazonProduct[] {
  const $ = cheerio.load(html);

  // Metadate pentru toate cele 50 de poziții (rang, variație), chiar și cele încărcate leneș.
  const meta = new Map<string, { rank?: number; change?: number }>();
  $("[data-client-recs-list]").each((_, el) => {
    try {
      const list = JSON.parse($(el).attr("data-client-recs-list") || "[]") as { id: string; metadataMap?: Record<string, string> }[];
      for (const it of list) {
        const m = it.metadataMap ?? {};
        meta.set(it.id, { rank: num(m["render.zg.rank"]), change: num(m["render.zg.bsms.percentageChange"]) });
      }
    } catch {}
  });

  const out: AmazonProduct[] = [];
  const seen = new Set<string>();
  const cards = $('[id="gridItemRoot"]').length ? $('[id="gridItemRoot"]') : $(".zg-item-immersion, .p13n-sc-uncoverable-faceout");
  cards.each((i, el) => {
    const card = $(el);
    const link = card.find('a[href*="/dp/"]').first();
    const href = link.attr("href") || "";
    const asin = card.find("[data-asin]").first().attr("data-asin")
      || card.find("[id]").toArray().map(e => $(e).attr("id") || "").find(id => ASIN_RE.test(id))
      || href.match(/\/dp\/([A-Z0-9]{10})/)?.[1]
      || "";
    if (!asin || seen.has(asin)) return;
    const img = card.find("img").first();
    const title = (card.find('[class*="line-clamp"], .p13n-sc-truncate, .p13n-sc-truncate-desktop-type2').first().text().trim() || img.attr("alt") || "").replace(/\s+/g, " ");
    if (!title) return;
    seen.add(asin);
    const text = spacedText(card);
    const priceText = card.find('[class*="p13n-sc-price"], .a-color-price, .a-price .a-offscreen').first().text() || text.match(PRICE_RE)?.[0];
    const ratingText = card.find(".a-icon-alt").first().text() || card.find('[title*="5"]').first().attr("title");
    const reviewsText = card.find('a[href*="product-reviews"] span, a[href*="customerReviews"] span').last().text() || card.find('a[href*="product-reviews"]').text();
    const rankText = card.find(".zg-bdg-text").first().text();
    const m = meta.get(asin);
    const changeText = text.match(/([+-]?\d[\d.,]*)\s?%/)?.[1];
    out.push({
      rank: num(rankText) ?? m?.rank ?? i + 1,
      asin,
      title,
      url: `${host}/dp/${asin}`,
      image: img.attr("src") || img.attr("data-src"),
      price: num(priceText ?? undefined),
      rating: num(ratingText?.match(/^\s*(\d[.,]\d)/)?.[1]),
      reviews: num(reviewsText),
      rankChangePct: m?.change ?? num(changeText),
    });
  });
  if (out.length >= 3) return out.sort((a, b) => a.rank - b.rank);
  return parseByProductLinks($, host, meta);
}

/**
 * Rezervă pentru alte layout-uri (mobil, liste noi): pornește de la fiecare link /dp/ASIN,
 * urcă până la containerul produsului (cel mai mare strămoș care conține un singur ASIN)
 * și citește prețul, ratingul și recenziile din textul lui.
 */
function parseByProductLinks($: cheerio.CheerioAPI, host: string, meta: Map<string, { rank?: number; change?: number }>): AmazonProduct[] {
  const out: AmazonProduct[] = [];
  const seen = new Set<string>();
  $('a[href*="/dp/"], a[href*="/gp/product/"]').each((_, el) => {
    const link = $(el);
    const asin = (link.attr("href") || "").match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)?.[1];
    if (!asin || seen.has(asin)) return;
    let card = link;
    for (let up = 0; up < 8; up++) {
      const parent = card.parent();
      if (!parent.length) break;
      const asins = new Set(parent.find('a[href*="/dp/"]').toArray().map(a => ($(a).attr("href") || "").match(/\/dp\/([A-Z0-9]{10})/)?.[1]).filter(Boolean));
      if (asins.size > 1) break;
      card = parent;
    }
    const img = card.find("img").first();
    const title = (card.find('[class*="line-clamp"], [class*="truncate"]').first().text().trim()
      || card.find('a[href*="/dp/"]').toArray().map(a => $(a).text().trim()).sort((x, y) => y.length - x.length)[0]
      || img.attr("alt") || "").replace(/\s+/g, " ");
    if (title.length < 8) return;
    seen.add(asin);
    const text = spacedText(card);
    const m = meta.get(asin);
    out.push({
      rank: num(text.match(/#\s?(\d{1,3})\b/)?.[1]) ?? m?.rank ?? out.length + 1,
      asin,
      title,
      url: `${host}/dp/${asin}`,
      image: img.attr("src") || img.attr("data-src"),
      price: num(text.match(PRICE_RE)?.[0]),
      rating: num(text.match(/(\d[.,]\d)\s*(?:out of|von|de)\s*5/)?.[1]),
      reviews: lastCount(spacedText(card.find('a[href*="product-reviews"], a[href*="customerReviews"]').last())),
      rankChangePct: m?.change,
    });
  });
  return out.sort((a, b) => a.rank - b.rank);
}

/** Rezumat al paginii pentru diagnostic, când nu găsim produse. */
export function amazonPageSummary(html: string): string[] {
  const $ = cheerio.load(html);
  const text = $("body").text().replace(/\s+/g, " ").trim();
  return [
    `Linkuri /dp/: ${(html.match(/\/dp\/[A-Z0-9]{10}/g) ?? []).length}, gridItemRoot: ${$('[id="gridItemRoot"]').length}, data-client-recs-list: ${$("[data-client-recs-list]").length}`,
    `Formular captcha: ${/validateCaptcha|captchacharacters|api-services-support@amazon/i.test(html) ? "DA" : "nu"}, consimțământ cookie: ${/sp-cc-accept|cookie/i.test(html) ? "posibil" : "nu"}`,
    `Text pagină: ${text.slice(0, 700)}`,
  ];
}
