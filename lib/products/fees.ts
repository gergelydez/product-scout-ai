/**
 * Comision eMAG % pe categorie (anexa eMAG din 30.09.2026), doar categoriile folosite până acum.
 * Pentru restul se folosește comisionul implicit din setări sau comisionul personalizat al produsului.
 */
export const EMAG_FEES: Record<number, number> = {
  1129: 18, 548: 18, 1338: 18, 312: 14, 308: 18, 1502: 23, 2085: 16, 2433: 18,
  1048: 18, 1111: 16, 433: 18, 1350: 18, 3109: 21, 2977: 21, 207: 21, 1131: 18,
};

export function feeFor(categoryId: number | null | undefined, override: number | null | undefined, fallback: number): { pct: number; source: "personalizat" | "categorie" | "implicit" } {
  if (override !== null && override !== undefined && Number.isFinite(override)) return { pct: override, source: "personalizat" };
  if (categoryId && EMAG_FEES[categoryId] !== undefined) return { pct: EMAG_FEES[categoryId], source: "categorie" };
  return { pct: fallback, source: "implicit" };
}
