const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "ro-RO,ro;q=0.9,en-US;q=0.8,en;q=0.7",
  "Cache-Control": "no-cache",
  "Sec-Ch-Ua": '"Chromium";v="129", "Not=A?Brand";v="8", "Google Chrome";v="129"',
  "Sec-Ch-Ua-Mobile": "?0",
  "Sec-Ch-Ua-Platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
};

export type Page = { status: number; html: string };

export async function fetchDirect(url: string, lang?: string): Promise<Page> {
  const headers = lang ? { ...HEADERS, "Accept-Language": lang } : HEADERS;
  const res = await fetch(url, { headers, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(12000) });
  return { status: res.status, html: await res.text() };
}

/**
 * Prin ScraperAPI (IP-uri rezidențiale), dacă SCRAPERAPI_KEY e setat în Vercel.
 * premium = IP-uri rezidențiale premium; render = rulează JavaScript-ul paginii (pentru site-uri
 * care încarcă produsele în browser). Ambele consumă mai multe credite.
 */
export async function fetchViaScraperApi(url: string, key: string, opts: { premium?: boolean; render?: boolean } = {}): Promise<Page> {
  const api = new URL("https://api.scraperapi.com/");
  api.searchParams.set("api_key", key);
  api.searchParams.set("url", url);
  if (opts.premium) api.searchParams.set("premium", "true");
  if (opts.render) api.searchParams.set("render", "true");
  const res = await fetch(api, { cache: "no-store", signal: AbortSignal.timeout(opts.render ? 55000 : 35000) });
  return { status: res.status, html: await res.text() };
}

export function pageTitle(html: string): string {
  return (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}

/**
 * Lista de încercări, în ordinea costului: direct (gratuit), ScraperAPI, ScraperAPI premium,
 * ScraperAPI cu randare JavaScript. Apelantul se oprește la prima pagină din care extrage produse.
 */
export function fetchAttempts(url: string, lang?: string): [string, () => Promise<Page>][] {
  const key = process.env.SCRAPERAPI_KEY?.trim();
  const attempts: [string, () => Promise<Page>][] = [["direct", () => fetchDirect(url, lang)]];
  if (key) attempts.push(
    ["ScraperAPI", () => fetchViaScraperApi(url, key)],
    ["ScraperAPI premium", () => fetchViaScraperApi(url, key, { premium: true })],
    ["ScraperAPI render JS", () => fetchViaScraperApi(url, key, { render: true })],
  );
  return attempts;
}
