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
  brand?: string;
  /** Cod produs eMAG (PNK), ex. DC2VHGYBM */
  pnk?: string;
  /** true = livrat de eMAG (FBE), false = livrat de vânzător (FBM) */
  fbe?: boolean;
};

export type ScanResult = {
  ok: boolean;
  source: Source;
  query: string;
  searchUrl: string;
  fetchedAt: string;
  products: ScannedProduct[];
  /** Numărul total de rezultate raportat de site */
  totalResults?: number;
  /** Cum au fost extrase datele: JSON din pagină sau HTML */
  method?: "json" | "html";
  error?: string;
  /** Site-ul a blocat cererea directă și nu e configurat un proxy */
  needsProxy?: boolean;
  /** Pe ce cale a reușit scanarea */
  via?: string;
  /** Ce a răspuns fiecare încercare (pentru diagnostic) */
  debug?: string[];
  /** Fragmente din pagina reală, pentru reglarea extragerii */
  samples?: string[];
  /** Termenul folosit efectiv, dacă diferă de cel cerut (ex. tradus în engleză) */
  queryUsed?: string;
  /** Avertisment: rezultatele par să nu corespundă căutării */
  warning?: string;
};
