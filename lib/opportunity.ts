import type { AmazonProduct } from "./amazon/parse";
import { DEFAULT_SETTINGS, summarize } from "./scan/metrics";
import type { ScanResult } from "./scan/types";

export type EmagCheck = {
  keyword: string;
  checkedAt: string;
  ok: boolean;
  error?: string;
  totalResults?: number;
  found: number;
  avgReviewsTop10?: number;
  medianPrice?: number;
  minPrice?: number;
  warning?: string;
  top10Units?: number;
};

export type Opportunity = {
  score: number;
  label: "Mare" | "Medie" | "Mică";
  demand: number;
  competition: number;
  priceRoom?: number;
  reasons: string[];
};

/** Lei pentru 1 GBP / 1 EUR (curs BNR live). */
export type FxLike = { GBP: number; EUR: number };

export function emagCheckFrom(keyword: string, r: ScanResult): EmagCheck {
  if (!r.ok) return { keyword, checkedAt: r.fetchedAt, ok: false, error: r.error, found: 0 };
  const s = summarize(r.products, DEFAULT_SETTINGS);
  const top10 = summarize(r.products.slice(0, 10), DEFAULT_SETTINGS);
  return {
    keyword, checkedAt: r.fetchedAt, ok: true,
    totalResults: r.totalResults, found: r.products.length,
    avgReviewsTop10: s.avgReviewsTop10, medianPrice: s.medianPrice, minPrice: s.minPrice, warning: r.warning, top10Units: top10.estMonthlyUnits,
  };
}

const clamp = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Scor 0–100:
 *  40% cerere validată pe Amazon (poziție în top, recenzii, creștere Movers & Shakers)
 *  40% concurență scăzută pe eMAG (puține rezultate, puține recenzii în top 10)
 *  20% spațiu de preț: marja netă reală la prețul median eMAG, dacă e completat costul Alibaba
 *      (30% marjă = maxim); altfel prețul median eMAG față de prețul Amazon în lei
 */
export function scoreOpportunity(a: AmazonProduct, e: EmagCheck | undefined, currency: "GBP" | "EUR", fx: FxLike | undefined, marginAtMedianPct?: number): Opportunity {
  const reasons: string[] = [];
  const rankScore = clamp(1 - (a.rank - 1) / 100);
  const reviewScore = clamp(Math.log10((a.reviews ?? 0) + 1) / 4); // 10.000 recenzii = 1
  const moverScore = a.rankChangePct ? clamp(Math.log10(a.rankChangePct + 1) / 3) : 0;
  const demand = clamp(0.5 * rankScore + 0.4 * reviewScore + 0.3 * moverScore);
  if (a.rank <= 10) reasons.push(`Top ${a.rank} pe Amazon`);
  if ((a.reviews ?? 0) >= 1000) reasons.push(`${a.reviews!.toLocaleString("ro-RO")} recenzii Amazon`);
  if ((a.rankChangePct ?? 0) >= 100) reasons.push(`+${a.rankChangePct}% în clasament`);

  if (!e?.ok) return { score: Math.round(demand * 40), label: "Mică", demand, competition: 1, reasons: [...reasons, "Nevalidat pe eMAG"] };

  if (e.warning) reasons.push("Rezultatele eMAG nu par legate de cuvânt – corectează cuvântul-cheie");
  let competition: number;
  if (e.found < 5) { competition = 0.05; reasons.push("Aproape inexistent pe eMAG"); }
  else {
    const reviewsC = clamp(Math.log10((e.avgReviewsTop10 ?? 0) + 1) / Math.log10(500)); // 500+ recenzii medii = saturat
    const resultsC = e.totalResults !== undefined ? clamp(Math.log10(e.totalResults + 1) / 4) : 0.5; // 10.000 rezultate = saturat
    competition = clamp(0.65 * reviewsC + 0.35 * resultsC);
    if ((e.avgReviewsTop10 ?? 0) < 20) reasons.push("Top 10 eMAG cu puține recenzii");
    if (e.totalResults !== undefined && e.totalResults < 300) reasons.push(`Doar ${e.totalResults} rezultate pe eMAG`);
  }

  let priceRoom: number | undefined;
  if (marginAtMedianPct !== undefined) {
    priceRoom = clamp(marginAtMedianPct / 30);
    reasons.push(marginAtMedianPct > 0 ? `Marjă netă ${marginAtMedianPct.toFixed(0)}% la prețul median` : "Pierdere la prețul median eMAG");
  } else if (a.price && e.medianPrice && fx) {
    const amazonRon = a.price * fx[currency];
    priceRoom = clamp(e.medianPrice / amazonRon / 1.5); // eMAG la 1,5× prețul Amazon = maxim
    if (e.medianPrice >= amazonRon) reasons.push("Preț eMAG ≥ preț Amazon");
  }

  const score = Math.round(100 * (0.4 * demand + 0.4 * (1 - competition) + 0.2 * (priceRoom ?? 0.5)));
  return { score, label: score >= 65 ? "Mare" : score >= 45 ? "Medie" : "Mică", demand, competition, priceRoom, reasons };
}
