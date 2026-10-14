export type FxRates = {
  /** Lei pentru 1 unitate din monedă */
  USD: number;
  EUR: number;
  GBP: number;
  date: string;
  source: string;
};

/** Cursul oficial BNR (XML public, actualizat zilnic în jurul orei 13:00). */
export function parseBnrXml(xml: string): FxRates | undefined {
  const date = xml.match(/<Cube\s+date="([\d-]+)"/)?.[1];
  const rate = (cur: string) => {
    const m = xml.match(new RegExp(`<Rate\\s+currency="${cur}"(?:\\s+multiplier="(\\d+)")?\\s*>([\\d.]+)</Rate>`));
    return m ? Number(m[2]) / Number(m[1] ?? 1) : undefined;
  };
  const USD = rate("USD"), EUR = rate("EUR"), GBP = rate("GBP");
  if (!date || !USD || !EUR || !GBP) return undefined;
  return { USD, EUR, GBP, date, source: "BNR" };
}

async function fromBnr(): Promise<FxRates | undefined> {
  const res = await fetch("https://www.bnr.ro/nbrfxrates.xml", { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) });
  return res.ok ? parseBnrXml(await res.text()) : undefined;
}

/** Rezervă: cursul BCE prin frankfurter.app (EUR→RON/USD/GBP). */
async function fromEcb(): Promise<FxRates | undefined> {
  const res = await fetch("https://api.frankfurter.app/latest?from=EUR&to=RON,USD,GBP", { next: { revalidate: 1800 }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) return undefined;
  const d = (await res.json()) as { date: string; rates: { RON: number; USD: number; GBP: number } };
  return { EUR: d.rates.RON, USD: d.rates.RON / d.rates.USD, GBP: d.rates.RON / d.rates.GBP, date: d.date, source: "BCE (rezervă)" };
}

export async function getRates(): Promise<FxRates | undefined> {
  for (const f of [fromBnr, fromEcb]) {
    try { const r = await f(); if (r) return r; } catch {}
  }
  return undefined;
}
