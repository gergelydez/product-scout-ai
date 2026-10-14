import type { ScannedProduct } from "./types";

type Json = unknown;
type Obj = Record<string, unknown>;

const isObj = (v: Json): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** "1.299,99 Lei" -> 1299.99, "89,99" -> 89.99, "89.99" -> 89.99 */
export function parseNumber(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v !== "string") return undefined;
  let s = v.replace(/[^\d.,]/g, "");
  if (!s) return undefined;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if (/\.\d{3}$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Găsește obiecte JSON atribuite în scripturi (ex. `EM.listingGlobals.items = [...]`,
 * `window.__STATE__ = {...}`) și conținutul scripturilor JSON.
 */
export function extractJsonBlobs(html: string): Json[] {
  const out: Json[] = [];
  const scripts = html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  for (const [, attrs, body] of scripts) {
    if (!body || body.length < 50) continue;
    if (/application\/(ld\+)?json/i.test(attrs)) {
      try { out.push(JSON.parse(body)); } catch {}
      continue;
    }
    for (const m of body.matchAll(/=\s*(?=[[{])/g)) {
      const start = (m.index ?? 0) + m[0].length;
      const end = balancedEnd(body, start);
      if (end < 0 || end - start < 50) continue;
      try { out.push(JSON.parse(body.slice(start, end))); } catch {}
    }
  }
  return out;
}

function balancedEnd(s: string, start: number): number {
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) return i + 1; }
  }
  return -1;
}

const NAME_KEYS = ["name", "title", "productName", "displayName"];

function firstString(o: Obj, keys: string[]): string | undefined {
  for (const k of keys) if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim();
  return undefined;
}

function looksLikeProduct(v: Json): boolean {
  if (!isObj(v)) return false;
  const keys = Object.keys(v).join(" ").toLowerCase();
  return !!firstString(v, NAME_KEYS) && /price|offer/.test(keys);
}

/** Caută recursiv cel mai mare array de obiecte care arată ca produse. */
export function findProductArray(root: Json): Obj[] {
  let best: Obj[] = [];
  const seen = new Set<Json>();
  const walk = (v: Json, depth: number) => {
    if (depth > 12 || v === null || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      const hits = v.filter(looksLikeProduct);
      if (hits.length >= 3 && hits.length >= v.length / 2 && hits.length > best.length) best = hits as Obj[];
      v.forEach(x => walk(x, depth + 1));
    } else Object.values(v).forEach(x => walk(x, depth + 1));
  };
  walk(root, 0);
  return best;
}

/** Caută prima valoare a unei chei care se potrivește cu `re`, până la adâncimea dată. */
function deepFind(o: Json, re: RegExp, accept: (v: unknown) => boolean, depth = 3): unknown {
  if (depth < 0) return undefined;
  if (Array.isArray(o)) {
    for (const v of o.slice(0, 5)) {
      const r = deepFind(v, re, accept, depth - 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  if (!isObj(o)) return undefined;
  for (const [k, v] of Object.entries(o)) if (re.test(k) && accept(v)) return v;
  for (const v of Object.values(o)) {
    const r = deepFind(v, re, accept, depth - 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

const PRICE_VALUE_KEYS = ["current", "sellingPrice", "discountedPrice", "value", "amount", "price", "text"];

function priceFrom(node: unknown, depth = 3): number | undefined {
  if (!isObj(node)) { const n = parseNumber(node); return n !== undefined && n > 0 ? n : undefined; }
  if (depth < 0) return undefined;
  for (const k of PRICE_VALUE_KEYS) {
    const n = priceFrom(node[k], depth - 1);
    if (n !== undefined) return n;
  }
  return undefined;
}

function pickPrice(o: Obj, re: RegExp): number | undefined {
  const node = deepFind(o, re, v => priceFrom(v) !== undefined, 3);
  return node === undefined ? undefined : priceFrom(node);
}

function pickUrl(o: Obj, base: string): string | undefined {
  const raw = deepFind(o, /^(url|link|href|path|desktop_url|productUrl)$/i, v => typeof v === "string" && /^(https?:\/\/|\/)/.test(v), 2);
  if (typeof raw !== "string") return undefined;
  if (raw.startsWith("http")) return raw;
  return base.replace(/\/$/, "") + raw;
}

function pickImage(o: Obj, imageBase: string): string | undefined {
  const isImg = (v: unknown) => typeof v === "string" && /\.(jpe?g|png|webp)/i.test(v);
  const found = deepFind(o, /image|img|thumb|picture/i, v => isImg(v) || (Array.isArray(v) && isImg(v[0])), 4);
  const v = (Array.isArray(found) ? found[0] : found)
    ?? deepFind(o, /url|src/i, v => typeof v === "string" && /\.(jpe?g|png|webp)/i.test(v), 4);
  if (typeof v !== "string") return undefined;
  if (v.startsWith("//")) return "https:" + v;
  if (v.startsWith("/")) return imageBase + v;
  return v;
}

function pickRating(o: Obj): number | undefined {
  const v = deepFind(o, /^(averageRating|average_rating|rating|ratingScore|score|stars)$/i, v => {
    const n = isObj(v) ? parseNumber(v.averageRating ?? v.value) : parseNumber(v);
    return n !== undefined && n > 0 && n <= 5;
  }, 3);
  if (v === undefined) return undefined;
  return isObj(v) ? parseNumber(v.averageRating ?? v.value) : parseNumber(v);
}

function pickReviews(o: Obj): number | undefined {
  const v = deepFind(o, /^(reviews?|reviewCount|reviews_count|totalCount|ratingCount|totalRatingCount|commentCount)$/i, v => {
    const n = isObj(v) ? parseNumber(v.count ?? v.total) : parseNumber(v);
    return n !== undefined && Number.isInteger(n) && n >= 0;
  }, 3);
  if (v === undefined) return undefined;
  return isObj(v) ? parseNumber(v.count ?? v.total) : parseNumber(v);
}

function pickSeller(o: Obj): string | undefined {
  const node = deepFind(o, /^(vendor|seller|merchant|merchantName|sellerName|vendorName)$/i, v => typeof v === "string" || isObj(v), 3);
  if (typeof node === "string") return node;
  if (isObj(node)) {
    const name = node.name;
    if (typeof name === "string") return name;
    if (isObj(name)) return firstString(name, ["display", "default", "value"]);
    return firstString(node, ["display_name", "displayName", "title"]);
  }
  return undefined;
}

export function normalizeProducts(items: Obj[], base: string, imageBase = base): ScannedProduct[] {
  return items.map((o, i) => ({
    position: i + 1,
    id: String(o.id ?? o.productId ?? o.contentId ?? o.offer_id ?? i),
    title: firstString(o, NAME_KEYS) ?? "",
    url: pickUrl(o, base) ?? "",
    image: pickImage(o, imageBase),
    price: pickPrice(o, /^(offer|price|prices|sellingPrice|priceInfo)$/i),
    oldPrice: pickPrice(o, /^(initial|initial_price|initialPrice|originalPrice|oldPrice|old_price|rrp)$/i),
    rating: pickRating(o),
    reviews: pickReviews(o),
    seller: pickSeller(o),
  })).filter(p => p.title);
}

/** Extrage produse din orice JSON încorporat în pagină. */
export function productsFromEmbeddedJson(html: string, base: string, imageBase = base): ScannedProduct[] {
  let best: Obj[] = [];
  for (const blob of extractJsonBlobs(html)) {
    const arr = findProductArray(blob);
    if (arr.length > best.length) best = arr;
  }
  return normalizeProducts(best, base, imageBase);
}

export function looksBlocked(status: number, html: string): string | undefined {
  if (status === 403 || status === 429) return `Marketplace-ul a refuzat cererea (HTTP ${status}).`;
  if (status >= 400) return `Marketplace-ul a răspuns cu HTTP ${status}.`;
  if (/captcha|cf-chl|access denied|are you a robot|verify you are human/i.test(html.slice(0, 20000)))
    return "Marketplace-ul a cerut verificare anti-robot (captcha).";
  return undefined;
}
