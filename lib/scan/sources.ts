import * as cheerio from "cheerio";
import { looksBlocked, parseNumber, pnkFromUrl, productListsFromEmbeddedJson } from "./extract";
import { fillFromNearbyHtml, htmlAroundFirstProduct, mergeLists } from "./merge";
import type { ScannedProduct, ScanResult, Source } from "./types";
import { fetchAttempts, pageTitle, type Page } from "../fetchPage";

const siteName = (s: Source) => (s === "emag" ? "eMAG" : "Trendyol");

export function searchUrl(source: Source, q: string): string {
  return source === "emag"
    ? `https://www.emag.ro/search/${encodeURIComponent(q.trim())}`
    : `https://www.trendyol.com/ro/sr?q=${encodeURIComponent(q.trim())}`;
}

/** Fallback pentru cardurile de produs eMAG din HTML. */
export function parseEmagHtml(html: string): ScannedProduct[] {
  const $ = cheerio.load(html);
  const out: ScannedProduct[] = [];
  $(".card-item[data-product-id], .card-item.js-product-data").each((i, el) => {
    const card = $(el);
    const link = card.find("a.card-v2-title, a.js-product-url, h2 a").first();
    const title = (card.attr("data-name") || link.text() || card.find("img").attr("alt") || "").trim();
    if (!title) return;
    const priceEl = card.find(".product-new-price").first().clone();
    const cents = priceEl.find("sup").text().replace(/\D/g, "");
    priceEl.find("sup, span").remove();
    const whole = priceEl.text().replace(/\D/g, "");
    const reviewsText = card.find(".star-rating-text, .card-v2-rating, .visible-xs-inline-block").text();
    const reviewsMatch = reviewsText.match(/\((\d[\d.]*)\)/) ?? reviewsText.match(/(\d[\d.]*)\s*(review|recenz)/i);
    out.push({
      position: out.length + 1,
      id: card.attr("data-product-id") || card.attr("data-offer-id") || String(i),
      title,
      url: card.attr("data-url") || link.attr("href") || "",
      image: card.find("img").first().attr("src") || card.find("img").first().attr("data-src"),
      price: whole ? Number(`${whole}.${cents || "0"}`) : undefined,
      oldPrice: parseNumber(card.find(".product-old-price, .rrp-lp30d-content s").first().text()),
      rating: parseNumber(card.find(".average-rating").first().text()),
      reviews: reviewsMatch ? parseNumber(reviewsMatch[1].replace(/\./g, "")) : undefined,
      seller: card.find(".card-v2-badge-cmp-holder .text-truncate, [data-vendor-name]").first().text().trim() || undefined,
    });
  });
  return out;
}

/** „4.128 rezultate pentru …” */
export function totalResults(html: string): number | undefined {
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const m = text.match(/(\d{1,3}(?:\.\d{3})*|\d+)\s+(?:de\s+)?(?:rezultate|produse)\s+pentru/i);
  return m ? Number(m[1].replace(/\./g, "")) : undefined;
}

function extractProducts(source: Source, html: string): { products: ScannedProduct[]; method: ScanResult["method"]; samples: string[] } {
  const siteBase = source === "emag" ? "https://www.emag.ro" : "https://www.trendyol.com/ro";
  const jsonLists = productListsFromEmbeddedJson(html, siteBase, source === "trendyol" ? "https://cdn.dsmcdn.com" : siteBase);
  const htmlList = source === "emag" ? parseEmagHtml(html) : [];
  const merged = mergeLists([...jsonLists.map(l => l.products), htmlList]);
  const products = fillFromNearbyHtml(html, merged).map(p => ({ ...p, pnk: p.pnk ?? pnkFromUrl(p.url) }));
  const method: ScanResult["method"] = htmlList.length >= merged.length && htmlList.length ? "html" : "json";
  const samples = [
    ...jsonLists.map((l, i) => `JSON listă ${i + 1} (${l.products.length} produse): ${l.sample}`),
    `HTML carduri găsite: ${htmlList.length}`,
    `HTML în jurul primului produs: ${htmlAroundFirstProduct(html, products[0])}`,
  ];
  return { products, method, samples };
}

export async function scan(source: Source, q: string): Promise<ScanResult> {
  const url = searchUrl(source, q);
  const base: ScanResult = { ok: false, source, query: q, searchUrl: url, fetchedAt: new Date().toISOString(), products: [], debug: [] };
  const key = process.env.SCRAPERAPI_KEY?.trim();
  const attempts = fetchAttempts(url);

  let lastError = "";
  for (const [via, attempt] of attempts) {
    let p: Page;
    try { p = await attempt(); } catch (e) {
      lastError = `Nu am putut contacta ${siteName(source)}: ${(e as Error).message}`;
      base.debug!.push(`${via}: eroare rețea (${(e as Error).message})`);
      continue;
    }
    base.debug!.push(`${via}: HTTP ${p.status}, ${Math.round(p.html.length / 1024)} KB, titlu „${pageTitle(p.html)}”`);
    // Încercăm întâi extragerea: paginile normale pot conține cuvântul „recaptcha” fără să fie blocate.
    const { products, method, samples } = p.status < 400 ? extractProducts(source, p.html) : { products: [], method: undefined, samples: [] };
    if (products.length) return { ...base, ok: true, products: products.slice(0, 60), totalResults: totalResults(p.html), method, via, samples };
    lastError = looksBlocked(p.status, p.html)
      ?? "Pagina s-a încărcat, dar nu am găsit produse în ea (structura site-ului s-a schimbat sau căutarea nu are rezultate).";
  }
  const hint = key
    ? " Nici prin ScraperAPI nu a mers. Trimite detaliile de mai jos pentru diagnostic."
    : " Serverul aplicației este blocat de protecția anti-roboți. Soluția: adaugă o cheie ScraperAPI (SCRAPERAPI_KEY) în setările Vercel.";
  return { ...base, error: `${siteName(source)}: ${lastError}${hint}`, needsProxy: !key };
}
