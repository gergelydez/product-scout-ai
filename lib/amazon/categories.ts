export type Market = "uk" | "de";
export type ListType = "bestsellers" | "movers";

export const MARKETS: Record<Market, { label: string; host: string; currency: "GBP" | "EUR"; lang: string }> = {
  uk: { label: "Amazon UK", host: "https://www.amazon.co.uk", currency: "GBP", lang: "en-GB,en;q=0.9" },
  de: { label: "Amazon DE", host: "https://www.amazon.de", currency: "EUR", lang: "de-DE,de;q=0.9,en;q=0.5" },
};

/** Categorii cu potențial pe eMAG (fără mărci mari, electronice complexe sau produse reglementate). */
export const CATEGORIES: { id: string; label: string; uk: string; de: string }[] = [
  { id: "kitchen", label: "Casă & bucătărie", uk: "kitchen", de: "kitchen" },
  { id: "auto", label: "Auto", uk: "automotive", de: "automotive" },
  { id: "pets", label: "Animale de companie", uk: "pet-supplies", de: "pet-supplies" },
  { id: "diy", label: "Bricolaj & unelte", uk: "diy", de: "diy" },
  { id: "garden", label: "Grădină", uk: "outdoors", de: "garden" },
  { id: "sports", label: "Sport & outdoor", uk: "sports", de: "sports" },
  { id: "baby", label: "Copii & bebeluși", uk: "baby", de: "baby" },
  { id: "toys", label: "Jucării", uk: "kids", de: "toys" },
  { id: "beauty", label: "Frumusețe", uk: "beauty", de: "beauty" },
  { id: "health", label: "Sănătate & îngrijire", uk: "drugstore", de: "drugstore" },
  { id: "office", label: "Birou & papetărie", uk: "officeproduct", de: "officeproduct" },
  { id: "lighting", label: "Iluminat", uk: "lighting", de: "lighting" },
  { id: "electronics", label: "Electronice & accesorii", uk: "electronics", de: "ce-de" },
];

export function listUrl(market: Market, list: ListType, categoryId: string, page = 1): string {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  const slug = cat ? cat[market] : categoryId;
  const path = list === "movers" ? "gp/movers-and-shakers" : "gp/bestsellers";
  return `${MARKETS[market].host}/${path}/${slug}${page > 1 ? `?pg=${page}` : ""}`;
}

/** Acceptăm doar linkuri Amazon UK/DE de tip best sellers / movers (evită folosirea serverului ca proxy). */
export function safeAmazonUrl(raw: string): { url: string; market: Market } | undefined {
  try {
    const u = new URL(raw);
    const market: Market | undefined = u.hostname.endsWith("amazon.co.uk") ? "uk" : u.hostname.endsWith("amazon.de") ? "de" : undefined;
    if (!market || !/\/(gp\/)?(bestsellers|movers-and-shakers|new-releases|most-wished-for)\b|\/(zgbs|Best-Sellers)/i.test(u.pathname)) return undefined;
    return { url: `${MARKETS[market].host}${u.pathname}${u.search}`, market };
  } catch { return undefined; }
}
