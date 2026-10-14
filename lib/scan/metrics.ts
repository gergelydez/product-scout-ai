import type { ScannedProduct } from "./types";

export type EstimateModel = "pozitie" | "recenzii";

export type EstimateSettings = {
  model: EstimateModel;
  /** Multiplicator pentru modelul pe poziție (1 = calibrarea implicită) */
  demandFactor: number;
  /** Câți cumpărători din 100 lasă o recenzie (%) */
  reviewRatePct: number;
  /** Vechimea medie presupusă a unui listing (luni) */
  listingAgeMonths: number;
};

export const DEFAULT_SETTINGS: EstimateSettings = { model: "pozitie", demandFactor: 1, reviewRatePct: 2, listingAgeMonths: 12 };

/**
 * Model „poziție + recenzii”: unități/lună ≈ 47,8 × poziție^-0,308 × (recenzii+1)^0,166.
 * Coeficienții au fost potriviți (regresie log-log) pe estimările X-Scan pentru
 * „videoproiector” (27 de produse, eroare medie ~20%). Cererea diferă între nișe,
 * de aceea există multiplicatorul `demandFactor`.
 *
 * Model „recenzii”: recenzii ÷ rata de recenzie ÷ vechimea listingului.
 *
 * Ambele sunt estimări, nu vânzări reale.
 */
export function estimateMonthlySales(p: ScannedProduct, s: EstimateSettings): number | undefined {
  if (s.model === "pozitie") {
    const units = 47.8 * Math.pow(Math.max(p.position, 1), -0.308) * Math.pow((p.reviews ?? 0) + 1, 0.166);
    return Math.max(1, Math.round(units * s.demandFactor));
  }
  if (p.reviews === undefined) return undefined;
  const total = p.reviews / Math.max(s.reviewRatePct / 100, 0.001);
  return Math.round(total / Math.max(s.listingAgeMonths, 1));
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : undefined);
const median = (xs: number[]) => {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export type Summary = {
  count: number;
  avgPrice?: number;
  medianPrice?: number;
  minPrice?: number;
  maxPrice?: number;
  avgReviews?: number;
  avgReviewsTop10?: number;
  avgRating?: number;
  lowReviewSharePct?: number;
  fbeCount?: number;
  avgTitleLength?: number;
  top10MedianReviews?: number;
  top10MedianRevenue?: number;
  estMonthlyUnits?: number;
  estMonthlyRevenue?: number;
  difficulty: "Scăzută" | "Medie" | "Ridicată" | "Necunoscută";
};

export function summarize(products: ScannedProduct[], s: EstimateSettings): Summary {
  const prices = products.map(p => p.price).filter((x): x is number => x !== undefined);
  const reviews = products.map(p => p.reviews).filter((x): x is number => x !== undefined);
  const top10 = products.slice(0, 10).map(p => p.reviews).filter((x): x is number => x !== undefined);
  const ratings = products.map(p => p.rating).filter((x): x is number => x !== undefined);
  let units = 0, revenue = 0, any = false;
  for (const p of products) {
    const u = estimateMonthlySales(p, s);
    if (u === undefined) continue;
    any = true; units += u; revenue += u * (p.price ?? 0);
  }
  const avgTop10 = avg(top10);
  const top10Revenue = products.slice(0, 10).map(p => {
    const u = estimateMonthlySales(p, s);
    return u !== undefined && p.price !== undefined ? u * p.price : undefined;
  }).filter((x): x is number => x !== undefined);
  const fbeKnown = products.filter(p => p.fbe !== undefined);
  const difficulty = avgTop10 === undefined ? "Necunoscută" : avgTop10 < 50 ? "Scăzută" : avgTop10 < 300 ? "Medie" : "Ridicată";
  return {
    count: products.length,
    avgPrice: avg(prices), medianPrice: median(prices),
    minPrice: prices.length ? Math.min(...prices) : undefined,
    maxPrice: prices.length ? Math.max(...prices) : undefined,
    avgReviews: avg(reviews), avgReviewsTop10: avgTop10, avgRating: avg(ratings),
    lowReviewSharePct: reviews.length ? (reviews.filter(r => r < 20).length / reviews.length) * 100 : undefined,
    fbeCount: fbeKnown.length ? fbeKnown.filter(p => p.fbe).length : undefined,
    avgTitleLength: avg(products.map(p => p.title.length)),
    top10MedianReviews: median(top10),
    top10MedianRevenue: median(top10Revenue),
    estMonthlyUnits: any ? units : undefined,
    estMonthlyRevenue: any ? revenue : undefined,
    difficulty,
  };
}

/* ---------- Istoric local: compară recenziile între scanări pentru viteza reală ---------- */

type Snapshot = { t: number; reviews?: number; price?: number };
const KEY = "scout-scan-history";

function load(): Record<string, Snapshot[]> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; }
}

export type Trend = { days: number; reviewDelta?: number; priceDelta?: number };

/** Salvează snapshot-ul curent și întoarce diferența față de cea mai veche scanare (peste 12 ore). */
export function recordAndCompare(source: string, products: ScannedProduct[]): Record<string, Trend> {
  const hist = load(), now = Date.now(), out: Record<string, Trend> = {};
  for (const p of products) {
    const k = `${source}:${p.id}`;
    const prev = (hist[k] ?? []).filter(x => now - x.t > 12 * 3600e3);
    const first = prev[0];
    if (first) out[p.id] = {
      days: (now - first.t) / 86400e3,
      reviewDelta: p.reviews !== undefined && first.reviews !== undefined ? p.reviews - first.reviews : undefined,
      priceDelta: p.price !== undefined && first.price !== undefined ? p.price - first.price : undefined,
    };
    const list = [...(hist[k] ?? []), { t: now, reviews: p.reviews, price: p.price }];
    hist[k] = list.length > 30 ? [list[0], ...list.slice(-29)] : list;
  }
  try { localStorage.setItem(KEY, JSON.stringify(hist)); } catch {}
  return out;
}
