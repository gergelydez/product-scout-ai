import { NextResponse } from "next/server";
import { CATEGORIES, listUrl, MARKETS, safeAmazonUrl, type ListType, type Market } from "@/lib/amazon/categories";
import { amazonPageSummary, parseAmazonList, type AmazonProduct } from "@/lib/amazon/parse";
import { fetchAttempts, pageTitle } from "@/lib/fetchPage";
import { looksBlocked } from "@/lib/scan/extract";

export const dynamic = "force-dynamic";
export const preferredRegion = ["fra1"];
export const maxDuration = 150;

export type AmazonListResult = {
  ok: boolean;
  market: Market;
  url: string;
  products: AmazonProduct[];
  fetchedAt: string;
  via?: string;
  error?: string;
  debug: string[];
};

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  let market: Market = sp.get("market") === "de" ? "de" : "uk";
  const rawList = sp.get("list");
  const list: ListType = rawList === "movers" || rawList === "new" || rawList === "wished" ? rawList : "bestsellers";
  const page = sp.get("page") === "2" ? 2 : 1;
  let url: string;
  const custom = sp.get("url");
  if (custom) {
    const safe = safeAmazonUrl(custom);
    if (!safe) return NextResponse.json({ ok: false, error: "Link invalid: folosește un link Amazon UK/DE de tip Best Sellers sau Movers & Shakers." }, { status: 400 });
    ({ url, market } = safe);
  } else {
    const cat = sp.get("category") ?? "kitchen";
    if (!CATEGORIES.some(c => c.id === cat)) return NextResponse.json({ ok: false, error: "Categorie necunoscută." }, { status: 400 });
    url = listUrl(market, list, cat, page);
  }

  const result: AmazonListResult = { ok: false, market, url, products: [], fetchedAt: new Date().toISOString(), debug: [] };
  let lastError = "";
  for (const [via, attempt] of fetchAttempts(url, MARKETS[market].lang)) {
    try {
      const p = await attempt();
      result.debug.push(`${via}: HTTP ${p.status}, ${Math.round(p.html.length / 1024)} KB, titlu „${pageTitle(p.html)}”`);
      const products = p.status < 400 ? parseAmazonList(p.html, MARKETS[market].host) : [];
      // Un top Amazon are 30–50 de produse; sub 5 înseamnă pagină de eroare/blocare cu linkuri din meniu.
      if (products.length >= 5) return NextResponse.json({ ...result, ok: true, products, via });
      if (products.length) result.debug.push(`  ${via} › doar ${products.length} produse găsite (${products.map(x => x.title.slice(0, 30)).join("; ")}) – probabil pagină de eroare, încerc mai departe`);
      if (p.status < 400) result.debug.push(...amazonPageSummary(p.html).map(l => `  ${via} › ${l}`));
      lastError = /validateCaptcha|captchacharacters/i.test(p.html) ? "Amazon a cerut captcha (robot check)."
        : looksBlocked(p.status, p.html) ?? "Pagina s-a încărcat, dar nu am găsit produse (categorie greșită sau structură schimbată).";
    } catch (e) {
      lastError = (e as Error).message;
      result.debug.push(`${via}: eroare rețea (${lastError})`);
    }
  }
  const hint = process.env.SCRAPERAPI_KEY ? "" : " Adaugă SCRAPERAPI_KEY în Vercel: Amazon blochează de obicei serverele.";
  return NextResponse.json({ ...result, error: `Amazon: ${lastError}${hint}` });
}
