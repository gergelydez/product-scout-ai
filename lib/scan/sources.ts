import * as cheerio from "cheerio";
import { looksBlocked, parseNumber, productsFromEmbeddedJson } from "./extract";
import type { ScannedProduct, ScanResult, Source } from "./types";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en;q=0.7",
};

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

export async function scan(source: Source, q: string): Promise<ScanResult> {
  const url = searchUrl(source, q);
  const base: ScanResult = { ok: false, source, query: q, searchUrl: url, fetchedAt: new Date().toISOString(), products: [] };
  let res: Response;
  try {
    res = await fetch(url, { headers: HEADERS, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(15000) });
  } catch (e) {
    return { ...base, error: `Nu am putut contacta ${source === "emag" ? "eMAG" : "Trendyol"}: ${(e as Error).message}` };
  }
  const html = await res.text();
  const blocked = looksBlocked(res.status, html);
  if (blocked) return { ...base, error: blocked };

  const siteBase = source === "emag" ? "https://www.emag.ro" : "https://www.trendyol.com/ro";
  let products = productsFromEmbeddedJson(html, siteBase, source === "trendyol" ? "https://cdn.dsmcdn.com" : siteBase);
  let method: ScanResult["method"] = "json";
  if (source === "emag") {
    const fromHtml = parseEmagHtml(html);
    if (fromHtml.length > products.length) { products = fromHtml; method = "html"; }
  }
  if (!products.length) return { ...base, error: "Pagina s-a încărcat, dar nu am găsit produse în ea (structura site-ului s-a schimbat sau căutarea nu are rezultate)." };
  return { ...base, ok: true, products: products.slice(0, 60), method };
}
