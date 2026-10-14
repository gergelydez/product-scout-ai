import { parseNumber } from "./extract";
import type { ScannedProduct } from "./types";

const FIELDS = ["url", "image", "price", "oldPrice", "rating", "reviews", "seller"] as const;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

const filled = (p: ScannedProduct) => FIELDS.filter(f => p[f] !== undefined && p[f] !== "").length;

/**
 * Combină listele găsite în pagină: pornește de la cea mai lungă / completă și completează
 * câmpurile lipsă din celelalte, potrivind după id, apoi după titlu.
 */
export function mergeLists(lists: ScannedProduct[][]): ScannedProduct[] {
  const nonEmpty = lists.filter(l => l.length);
  if (!nonEmpty.length) return [];
  const score = (l: ScannedProduct[]) => l.length * 10 + l.reduce((a, p) => a + filled(p), 0) / l.length;
  const [main, ...rest] = [...nonEmpty].sort((a, b) => score(b) - score(a));
  return main.map(p => {
    const out = { ...p };
    for (const list of rest) {
      const match = list.find(o => o.id === p.id) ?? list.find(o => norm(o.title) === norm(p.title));
      if (!match) continue;
      for (const f of FIELDS) if (out[f] === undefined || out[f] === "") (out as Record<string, unknown>)[f] = match[f];
    }
    return out;
  });
}

/** HTML decodat, cu conținutul scripturilor înlocuit cu spații (pozițiile rămân aceleași). */
function visibleHtml(html: string): string {
  return decode(html).replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, a, b, c) => a + " ".repeat(b.length) + c);
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");

/**
 * Ultima plasă de siguranță: pentru produsele cărora le lipsește prețul / ratingul / recenziile,
 * caută valorile în HTML-ul brut, între titlul produsului și titlul următorului produs.
 */
export function fillFromNearbyHtml(html: string, products: ScannedProduct[]): ScannedProduct[] {
  const text = visibleHtml(html);
  const positions = products.map(p => {
    const key = p.title.slice(0, 30);
    return key ? text.indexOf(key) : -1;
  });
  return products.map((p, i) => {
    const start = positions[i];
    if (start < 0 || (p.price !== undefined && p.reviews !== undefined && p.rating !== undefined && p.image)) return p;
    const nextStarts = positions.filter(x => x > start);
    const end = Math.min(nextStarts.length ? Math.min(...nextStarts) : start + 6000, start + 6000);
    // poza apare de obicei înainte de titlu: căutăm între produsul anterior și titlu
    const prevStarts = positions.filter(x => x >= 0 && x < start);
    const before = text.slice(Math.max(prevStarts.length ? Math.max(...prevStarts) + 30 : 0, start - 2500), start);
    const after = text.slice(start, end);
    const out = { ...p };
    if (out.price === undefined) {
      const m = after.match(/product-new-price[^>]*>\s*([\d.]+)\s*<sup>\s*(\d{2})/i) ?? after.match(/([\d.]+)<sup>(\d{2})<\/sup>\s*(?:<span[^>]*>)?\s*Lei/i);
      if (m) out.price = Number(`${m[1].replace(/\./g, "")}.${m[2]}`);
      else { const m2 = after.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*Lei/i); if (m2) out.price = parseNumber(m2[1]); }
    }
    if (out.rating === undefined) {
      const m = after.match(/average-rating[^>]*>\s*([1-5](?:[.,]\d{1,2})?)/i) ?? after.match(/rated-([1-5](?:-\d)?)/i);
      if (m) out.rating = parseNumber(m[1].replace("-", "."));
    }
    if (out.reviews === undefined) {
      const m = after.match(/\((\d{1,6})\)/) ?? after.match(/(\d{1,6})\s*(?:review|recenzi)/i);
      if (m) out.reviews = Number(m[1]);
    }
    if (!out.image) {
      const re = /(?:src|data-src|srcset)="(https?:\/\/[^"\s]+\.(?:jpe?g|png|webp)[^"\s]*)/gi;
      const last = [...before.matchAll(re)].pop() ?? [...after.matchAll(re)][0];
      if (last) out.image = last[1];
    }
    return out;
  });
}

/** Fragment din HTML în jurul primului produs, pentru diagnostic. */
export function htmlAroundFirstProduct(html: string, p?: ScannedProduct): string {
  if (!p) return "";
  const text = visibleHtml(html);
  const i = text.indexOf(p.title.slice(0, 30));
  if (i < 0) return "(titlul primului produs nu apare în HTML-ul vizibil)";
  return text.slice(Math.max(0, i - 1500), i + 3000).replace(/\s{2,}/g, " ");
}
