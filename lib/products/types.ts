export type Status = "idee" | "analiza" | "proba" | "listat" | "respins";

export const STATUSES: { id: Status; label: string }[] = [
  { id: "idee", label: "Idee" },
  { id: "analiza", label: "În analiză" },
  { id: "proba", label: "Mostră comandată" },
  { id: "listat", label: "Listat pe eMAG" },
  { id: "respins", label: "Respins" },
];

export type Product = {
  id: string;
  name: string;
  status: Status;
  category?: string;
  categoryId?: number | null;
  keyword?: string;
  keywordEn?: string;
  /** Cost / buc la furnizor, USD fără TVA */
  costUsd?: number | null;
  weightKg?: number | null;
  /** Taxa vamală % pentru codul HS (înlocuiește valoarea implicită) */
  dutyPct?: number | null;
  hsCode?: string;
  /** Alte costuri / buc, lei */
  shipRon?: number | null;
  /** Preț de vânzare pe eMAG, lei cu TVA */
  priceRon?: number | null;
  /** Comision eMAG % personalizat */
  feeOverride?: number | null;
  moq?: number | null;
  link?: string;
  emagLink?: string;
  competitorLink?: string;
  priceSource?: string;
  desc?: string;
  note?: string;
  pricesVerified?: boolean;
  /** Ultima verificare pe eMAG din aplicație */
  emagResults?: number | null;
  emagCheck?: { at: string; total?: number; found: number; medianPrice?: number; minPrice?: number; avgReviewsTop10?: number } | null;
  createdAt: string;
  updatedAt: string;
};

export function newId(): string {
  return "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
