export type Source = "emag" | "trendyol";

export type ScannedProduct = {
  position: number;
  id: string;
  title: string;
  url: string;
  image?: string;
  price?: number;
  oldPrice?: number;
  rating?: number;
  reviews?: number;
  seller?: string;
};

export type ScanResult = {
  ok: boolean;
  source: Source;
  query: string;
  searchUrl: string;
  fetchedAt: string;
  products: ScannedProduct[];
  /** Cum au fost extrase datele: JSON din pagină sau HTML */
  method?: "json" | "html";
  error?: string;
  /** Site-ul a blocat cererea directă și nu e configurat un proxy */
  needsProxy?: boolean;
};
