"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, ExternalLink, Download, Calculator, TrendingUp, AlertTriangle, SlidersHorizontal } from "lucide-react";
import type { ScanResult, ScannedProduct, Source } from "@/lib/scan/types";
import { DEFAULT_SETTINGS, estimateMonthlySales, recordAndCompare, summarize, type EstimateSettings, type Trend } from "@/lib/scan/metrics";

const lei = (n?: number) => n === undefined ? "–" : new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 }).format(n);
const num = (n?: number, d = 0) => n === undefined ? "–" : new Intl.NumberFormat("ro-RO", { maximumFractionDigits: d }).format(n);

type SortKey = "position" | "price" | "reviews" | "rating" | "sales" | "revenue";

export default function LiveScan({ initialQuery, trigger, onUsePrice }: { initialQuery: string; trigger: number; onUsePrice: (price: number) => void }) {
  const [q, setQ] = useState(initialQuery);
  const [source, setSource] = useState<Source>("emag");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [trends, setTrends] = useState<Record<string, Trend>>({});
  const [sort, setSort] = useState<SortKey>("position");
  const [settings, setSettings] = useState<EstimateSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);

  async function run(query = q, src = source) {
    if (query.trim().length < 2) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/scan?source=${src}&q=${encodeURIComponent(query.trim())}`);
      const data: ScanResult = await r.json();
      setResult(data);
      setTrends(data.ok ? recordAndCompare(src, data.products) : {});
    } catch (e) {
      setResult({ ok: false, source: src, query, searchUrl: "", fetchedAt: new Date().toISOString(), products: [], error: (e as Error).message });
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (trigger > 0) { setQ(initialQuery); run(initialQuery); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const rows = useMemo(() => {
    const list = (result?.products ?? []).map(p => {
      const sales = estimateMonthlySales(p, settings);
      return { ...p, sales, revenue: sales !== undefined && p.price !== undefined ? sales * p.price : undefined };
    });
    if (sort === "position") return list;
    return [...list].sort((a, b) => ((b[sort] as number | undefined) ?? -1) - ((a[sort] as number | undefined) ?? -1));
  }, [result, sort, settings]);

  const sum = useMemo(() => summarize(result?.products ?? [], settings), [result, settings]);

  function exportCsv() {
    const head = ["Poz", "Produs", "Preț", "Preț vechi", "Rating", "Recenzii", "Vânzător", "Vânzări/lună (estimare)", "Venit/lună (estimare)", "URL"];
    const data = rows.map(p => [p.position, p.title, p.price ?? "", p.oldPrice ?? "", p.rating ?? "", p.reviews ?? "", p.seller ?? "", p.sales ?? "", p.revenue ? Math.round(p.revenue) : "", p.url]);
    const csv = [head, ...data].map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `scan-${source}-${q.trim().replace(/\s+/g, "-")}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <section>
    <div className="panel scanbar">
      <div className="scaninput">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="Ex. organizator portbagaj" aria-label="Cuvânt-cheie pentru scanare" />
        <select value={source} onChange={e => { const s = e.target.value as Source; setSource(s); if (result) run(q, s); }} aria-label="Marketplace">
          <option value="emag">eMAG.ro</option>
          <option value="trendyol">Trendyol RO</option>
        </select>
        <button className="primary" onClick={() => run()} disabled={loading}>{loading ? <Loader2 size={17} className="spin" /> : <Search size={17} />} Scanează</button>
      </div>
      <p className="footnote" style={{ margin: "10px 0 0" }}>Citește în timp real prima pagină de rezultate (până la 60 de produse): preț, rating, recenzii, vânzător. Vânzările sunt <b>estimări</b> din numărul de recenzii.</p>
    </div>

    {result && !result.ok && <div className="panel scanerror"><AlertTriangle size={18} /><div><strong>Scanarea nu a reușit.</strong><p>{result.error}</p>{result.searchUrl && <a className="secondary" href={result.searchUrl} target="_blank" rel="noreferrer">Deschide căutarea pe site <ExternalLink size={12} /></a>}</div></div>}

    {result?.ok && <>
      <div className="metrics">
        <div className="metric"><div className="label">Produse găsite</div><strong>{sum.count}</strong><small>{result.source === "emag" ? "eMAG" : "Trendyol"} · {new Date(result.fetchedAt).toLocaleTimeString("ro-RO")}</small></div>
        <div className="metric"><div className="label">Preț mediu</div><strong>{lei(sum.avgPrice)}</strong><small>median {lei(sum.medianPrice)} · {lei(sum.minPrice)}–{lei(sum.maxPrice)}</small></div>
        <div className="metric"><div className="label">Recenzii medii top 10</div><strong>{num(sum.avgReviewsTop10)}</strong><small>rating mediu {num(sum.avgRating, 2)} · {num(sum.lowReviewSharePct)}% sub 20 recenzii</small></div>
        <div className="metric"><div className="label">Dificultate intrare</div><strong>{sum.difficulty}</strong><small>după recenziile din top 10</small></div>
        <div className="metric"><div className="label">Vânzări/lună pagina 1*</div><strong>{num(sum.estMonthlyUnits)}</strong><small>estimare din recenzii</small></div>
        <div className="metric"><div className="label">Venit/lună pagina 1*</div><strong>{lei(sum.estMonthlyRevenue)}</strong><small>estimare din recenzii</small></div>
      </div>

      <div className="sectionhead">
        <div><h3>Rezultate pentru „{result.query}”</h3><p>*Estimările presupun că {settings.reviewRatePct}% din cumpărători lasă recenzie și o vechime de {settings.listingAgeMonths} luni a listingului.</p></div>
        <div className="actions" style={{ marginTop: 0 }}>
          <select className="secondary" value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sortare">
            <option value="position">Poziție pe site</option><option value="sales">Vânzări estimate</option><option value="revenue">Venit estimat</option>
            <option value="reviews">Recenzii</option><option value="price">Preț</option><option value="rating">Rating</option>
          </select>
          <button className="secondary" onClick={() => setShowSettings(s => !s)}><SlidersHorizontal size={13} /> Ipoteze</button>
          <button className="secondary" onClick={exportCsv}><Download size={13} /> CSV</button>
        </div>
      </div>

      {showSettings && <div className="panel toolrow" style={{ marginTop: 0, marginBottom: 12 }}>
        <div className="field"><label>% cumpărători care lasă recenzie</label><input type="number" min={0.1} step={0.5} value={settings.reviewRatePct} onChange={e => setSettings(s => ({ ...s, reviewRatePct: Number(e.target.value) || DEFAULT_SETTINGS.reviewRatePct }))} /></div>
        <div className="field"><label>Vechime medie listing (luni)</label><input type="number" min={1} value={settings.listingAgeMonths} onChange={e => setSettings(s => ({ ...s, listingAgeMonths: Number(e.target.value) || DEFAULT_SETTINGS.listingAgeMonths }))} /></div>
        <p className="footnote" style={{ alignSelf: "end" }}>Scanează același cuvânt din nou după câteva zile: aplicația compară recenziile și afișează creșterea reală.</p>
      </div>}

      <div className="scanlist">
        {rows.map(p => <ScanRow key={`${p.id}-${p.position}`} p={p} trend={trends[p.id]} onUsePrice={onUsePrice} />)}
      </div>
    </>}
  </section>;
}

function ScanRow({ p, trend, onUsePrice }: { p: ScannedProduct & { sales?: number; revenue?: number }; trend?: Trend; onUsePrice: (n: number) => void }) {
  return <article className="scanrow">
    <div className="scanpos">#{p.position}</div>
    {p.image ? <img src={p.image} alt="" loading="lazy" /> : <div className="scanimg" />}
    <div className="scanmain">
      <a href={p.url} target="_blank" rel="noreferrer" className="prodtitle">{p.title}</a>
      <div className="prodmeta">{p.seller ? `Vânzător: ${p.seller}` : "Vânzător necunoscut"}{trend?.reviewDelta !== undefined && <span className="trend"><TrendingUp size={11} /> +{trend.reviewDelta} recenzii în {num(trend.days, 1)} zile</span>}</div>
      <div className="scanstats">
        <div><small>Preț</small><strong>{lei(p.price)}</strong>{p.oldPrice && p.price && p.oldPrice > p.price ? <s>{lei(p.oldPrice)}</s> : null}</div>
        <div><small>Rating</small><strong>{p.rating ? `★ ${num(p.rating, 1)}` : "–"}</strong></div>
        <div><small>Recenzii</small><strong>{num(p.reviews)}</strong></div>
        <div><small>Vânz./lună*</small><strong>{num(p.sales)}</strong></div>
        <div><small>Venit/lună*</small><strong>{lei(p.revenue)}</strong></div>
      </div>
    </div>
    {p.price !== undefined && <button className="secondary scancalc" onClick={() => onUsePrice(p.price!)} title="Calculează profitul la acest preț"><Calculator size={14} /></button>}
  </article>;
}
