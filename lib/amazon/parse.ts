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
    const text = card.text().replace(/\s+/g, " ");
    const priceText = card.find('[class*="p13n-sc-price"], .a-color-price, .a-price .a-offscreen').first().text() || text.match(/[£€]\s?\d[\d.,]*|\d[\d.,]*\s?€/)?.[0];
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
  return out.sort((a, b) => a.rank - b.rank);
}
