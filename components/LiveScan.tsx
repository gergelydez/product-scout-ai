"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, ExternalLink, Download, Calculator, TrendingUp, AlertTriangle, SlidersHorizontal } from "lucide-react";
import type { ScanResult, ScannedProduct, Source } from "@/lib/scan/types";
import CopyDiag from "./CopyDiag";
import { DEFAULT_SETTINGS, estimateMonthlySales, recordAndCompare, summarize, type EstimateSettings, type Trend } from "@/lib/scan/metrics";

const lei = (n?: number) => n === undefined ? "–" : new Intl.NumberFormat("ro-RO", { style: "currency", currency: "RON", maximumFractionDigits: 0 }).format(n);
const num = (n?: number, d = 0) => n === undefined ? "–" : new Intl.NumberFormat("ro-RO", { maximumFractionDigits: d }).format(n);

type SortKey = "position" | "price" | "reviews" | "rating" | "sales" | "revenue";

export default function LiveScan({ initialQuery, trigger, onCalc }: { initialQuery: string; trigger: number; onCalc: (p: { title: string; salePrice?: number; minPrice?: number; medianPrice?: number }) => void }) {
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

  const [fbeFilter, setFbeFilter] = useState<"toate" | "fbe" | "fbm">("toate");
  const [view, setView] = useState<"tabel" | "carduri">("tabel");
  const [dir, setDir] = useState<1 | -1>(1);

  const allRows = useMemo(() => (result?.products ?? []).map(p => {
    const sales = estimateMonthlySales(p, settings);
    return { ...p, sales, revenue: sales !== undefined && p.price !== undefined ? sales * p.price : undefined };
  }), [result, settings]);

  const rows = useMemo(() => {
    const list = allRows.filter(p => fbeFilter === "toate" || (fbeFilter === "fbe" ? p.fbe === true : p.fbe !== true));
    const val = (p: Row) => (sort === "position" ? p.position : (p[sort] as number | undefined));
    return [...list].sort((a, b) => {
      const x = val(a), y = val(b);
      if (x === undefined) return 1;
      if (y === undefined) return -1;
      return (sort === "position" ? x - y : y - x) * dir;
    });
  }, [allRows, sort, dir, fbeFilter]);

  function sortBy(k: SortKey) {
    if (k === sort) setDir(d => (d === 1 ? -1 : 1));
    else { setSort(k); setDir(1); }
  }

  const sum = useMemo(() => summarize(result?.products ?? [], settings), [result, settings]);
  const openCalc = (p: Row) => onCalc({ title: result?.query ?? p.title, salePrice: p.price, minPrice: sum.minPrice, medianPrice: sum.medianPrice });
  const hasFbe = allRows.some(p => p.fbe !== undefined);

  function exportCsv() {
    const head = ["Poz", "Produs", "Brand", "Vânzător", "PNK", "FBE/FBM", "Preț", "Preț vechi", "Unități/lună (estimare)", "Venit/lună (estimare)", "Rating", "Recenzii", "URL"];
    const data = rows.map(p => [p.position, p.title, p.brand ?? "", p.seller ?? "", p.pnk ?? "", p.fbe === undefined ? "" : p.fbe ? "FBE" : "FBM", p.price ?? "", p.oldPrice ?? "", p.sales ?? "", p.revenue ? Math.round(p.revenue) : "", p.rating ?? "", p.reviews ?? "", p.url]);
    const csv = [head, ...data].map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `scan-${source}-${q.trim().replace(/\s+/g, "-")}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const modelNote = settings.model === "pozitie"
    ? `model poziție + recenzii${settings.demandFactor !== 1 ? ` × ${settings.demandFactor}` : ""}`
    : `${settings.reviewRatePct}% recenzii, ${settings.listingAgeMonths} luni`;

  return <section>
    <div className="panel scanbar">
      <div className="scaninput">
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="Ex. videoproiector" aria-label="Cuvânt-cheie pentru scanare" />
        <select value={source} onChange={e => { const s = e.target.value as Source; setSource(s); if (result) run(q, s); }} aria-label="Marketplace">
          <option value="emag">eMAG.ro</option>
          <option value="trendyol">Trendyol RO</option>
        </select>
        <button className="primary" onClick={() => run()} disabled={loading}>{loading ? <Loader2 size={17} className="spin" /> : <Search size={17} />} Scanează</button>
      </div>
      <p className="footnote" style={{ margin: "10px 0 0" }}>Citește în timp real prima pagină de rezultate (până la 60 de produse). Unitățile și venitul lunar sunt <b>estimări</b>, nu vânzări reale.</p>
    </div>

    {result && !result.ok && <div className="panel scanerror"><AlertTriangle size={18} /><div><strong>Scanarea nu a reușit.</strong><p>{result.error}</p>{result.needsProxy && <p className="footnote">Pași: creează cont gratuit pe scraperapi.com → copiază „API Key” → în Vercel: Project → Settings → Environment Variables → nume <b>SCRAPERAPI_KEY</b>, valoare cheia → Save → Deployments → Redeploy.{result.source === "emag" && " Între timp poți încerca Trendyol RO din meniul de lângă căutare."}</p>}{!!result.debug?.length && <CopyDiag lines={[`URL: ${result.searchUrl}`, result.error ?? "", ...result.debug]} />}{result.searchUrl && <a className="secondary" href={result.searchUrl} target="_blank" rel="noreferrer">Deschide căutarea pe site <ExternalLink size={12} /></a>}</div></div>}

    {result?.ok && <>
      <div className="sectionhead" style={{ marginTop: 18 }}>
        <div><h3>Rezultate pentru „{result.query}”</h3><p>Primele {sum.count}{result.totalResults ? ` din ${num(result.totalResults)}` : ""} rezultate{result.queryUsed ? ` pentru „${result.queryUsed}”` : ""} · {result.source === "emag" ? "eMAG" : "Trendyol"} · {new Date(result.fetchedAt).toLocaleTimeString("ro-RO")}{result.via && result.via !== "direct" ? ` · prin ${result.via}` : ""}</p></div>
      </div>

      {result.warning && <div className="panel scanerror" style={{ marginTop: 0 }}><AlertTriangle size={18} /><div><strong>Atenție la rezultate</strong><p>{result.warning}</p></div></div>}

      <div className="metrics scanmetrics">
        <div className="metric"><div className="label">Toate rezultatele</div><strong>{num(result.totalResults)}</strong><small>raportate de site</small></div>
        <div className="metric"><div className="label">Produse FBE pagina 1</div><strong>{num(sum.fbeCount)}</strong><small>livrate de eMAG</small></div>
        <div className="metric"><div className="label">Preț mediu pagina 1</div><strong>{lei(sum.avgPrice)}</strong><small>median {lei(sum.medianPrice)}</small></div>
        <div className="metric"><div className="label">Nr. mediu recenzii pagina 1</div><strong>{num(sum.avgReviews)}</strong><small>rating mediu {num(sum.avgRating, 2)}</small></div>
        <div className="metric"><div className="label">Caractere titlu mediu</div><strong>{num(sum.avgTitleLength)}</strong><small>pagina 1</small></div>
        <div className="metric"><div className="label">Top 10 produse</div><strong>{lei(sum.top10MedianRevenue)}</strong><small>med. venit/lună* · med. recenzii {num(sum.top10MedianReviews)}</small></div>
        <div className="metric"><div className="label">Unități/lună pagina 1*</div><strong>{num(sum.estMonthlyUnits)}</strong><small>venit {lei(sum.estMonthlyRevenue)}</small></div>
        <div className="metric"><div className="label">Dificultate intrare</div><strong>{sum.difficulty}</strong><small>{num(sum.lowReviewSharePct)}% produse sub 20 recenzii</small></div>
      </div>

      <div className="scantools">
        {hasFbe && <div className="seg">{(["toate", "fbe", "fbm"] as const).map(f => <button key={f} className={fbeFilter === f ? "active" : ""} onClick={() => setFbeFilter(f)}>{f === "toate" ? "Toate" : f.toUpperCase()}</button>)}</div>}
        <div className="seg">{(["tabel", "carduri"] as const).map(v => <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v === "tabel" ? "Tabel" : "Carduri"}</button>)}</div>
        <div className="actions" style={{ marginTop: 0, marginLeft: "auto" }}>
          <button className="secondary" onClick={() => setShowSettings(s => !s)}><SlidersHorizontal size={13} /> Estimare</button>
          <button className="secondary" onClick={exportCsv}><Download size={13} /> CSV</button>
        </div>
      </div>

      {showSettings && <div className="panel toolrow" style={{ marginTop: 0, marginBottom: 12 }}>
        <div className="field"><label>Model de estimare</label><select value={settings.model} onChange={e => setSettings(s => ({ ...s, model: e.target.value as EstimateSettings["model"] }))}><option value="pozitie">Poziție + recenzii (calibrat pe X-Scan)</option><option value="recenzii">Doar recenzii</option></select></div>
        {settings.model === "pozitie"
          ? <div className="field"><label>Multiplicator cerere nișă (1 = normal)</label><input type="number" min={0.1} step={0.1} value={settings.demandFactor} onChange={e => setSettings(s => ({ ...s, demandFactor: Number(e.target.value) || 1 }))} /></div>
          : <>
            <div className="field"><label>% cumpărători care lasă recenzie</label><input type="number" min={0.1} step={0.5} value={settings.reviewRatePct} onChange={e => setSettings(s => ({ ...s, reviewRatePct: Number(e.target.value) || DEFAULT_SETTINGS.reviewRatePct }))} /></div>
            <div className="field"><label>Vechime medie listing (luni)</label><input type="number" min={1} value={settings.listingAgeMonths} onChange={e => setSettings(s => ({ ...s, listingAgeMonths: Number(e.target.value) || DEFAULT_SETTINGS.listingAgeMonths }))} /></div>
          </>}
        <p className="footnote" style={{ alignSelf: "end" }}>Modelul pe poziție a fost potrivit pe estimările X-Scan pentru „videoproiector” (eroare medie ~20%). Pentru nișe mai mici/mari ajustează multiplicatorul. Scanează același cuvânt peste câteva zile ca să vezi creșterea reală a recenziilor.</p>
      </div>}

      {rows.length > 0 && rows.filter(p => p.price === undefined).length > rows.length / 2 && <Diagnostic result={result} />}

      {view === "tabel"
        ? <div className="scantablewrap"><table className="scantable">
          <thead><tr>
            <Th k="position" label="#" sort={sort} dir={dir} onSort={sortBy} />
            <th className="sticky">Produs</th>
            <th>Brand</th><th>Vânzător</th><th>PNK</th><th>FBE/FBM</th>
            <Th k="price" label="Preț" sort={sort} dir={dir} onSort={sortBy} />
            <Th k="sales" label="Unități lunare est.*" sort={sort} dir={dir} onSort={sortBy} />
            <Th k="revenue" label="Venit lunar est.*" sort={sort} dir={dir} onSort={sortBy} />
            <Th k="rating" label="Rating" sort={sort} dir={dir} onSort={sortBy} />
            <Th k="reviews" label="Nr. recenzii" sort={sort} dir={dir} onSort={sortBy} />
            <th>Alibaba</th><th>Calculator</th>
          </tr></thead>
          <tbody>{rows.map(p => {
            const t = trends[p.id];
            return <tr key={`${p.id}-${p.position}`}>
              <td>{p.position}</td>
              <td className="sticky"><div className="cellprod">{p.image ? <img src={p.image} alt="" loading="lazy" /> : <span className="scanimg" />}<a href={p.url} target="_blank" rel="noreferrer" title={p.title}>{p.title}</a></div></td>
              <td>{p.brand ?? "–"}</td>
              <td>{p.seller ?? "–"}</td>
              <td>{p.pnk ? <a href={p.url} target="_blank" rel="noreferrer">{p.pnk}</a> : "–"}</td>
              <td>{p.fbe === undefined ? "–" : <span className={`badge ${p.fbe ? "fbe" : "fbm"}`}>{p.fbe ? "FBE" : "FBM"}</span>}</td>
              <td className="num">{lei(p.price)}{p.oldPrice && p.price && p.oldPrice > p.price ? <s>{lei(p.oldPrice)}</s> : null}</td>
              <td className="num">{num(p.sales)}</td>
              <td className="num">{lei(p.revenue)}</td>
              <td className="num">{p.rating ? <><span className="star">★</span> {num(p.rating, 1)}</> : "–"}</td>
              <td className="num">{num(p.reviews)}{t?.reviewDelta ? <span className="trend" title={`în ${num(t.days, 1)} zile`}>+{t.reviewDelta}</span> : null}</td>
              <td><a href={alibabaUrl(p.title)} target="_blank" rel="noreferrer">Vezi</a></td>
              <td>{p.price !== undefined ? <button className="calcbtn" onClick={() => openCalc(p)}>Calculator <Calculator size={12} /></button> : "–"}</td>
            </tr>;
          })}</tbody>
        </table></div>
        : <div className="scanlist">{rows.map(p => <ScanRow key={`${p.id}-${p.position}`} p={p} trend={trends[p.id]} onUsePrice={() => openCalc(p)} />)}</div>}
      <p className="footnote" style={{ marginTop: 10 }}>*Estimare ({modelNote}). Nu sunt vânzări reale.</p>
      {!(rows.filter(p => p.price === undefined).length > rows.length / 2) && <details className="footnote" style={{ marginTop: 6 }}><summary>Diagnostic pentru suport</summary><Diagnostic result={result} quiet /></details>}
    </>}
  </section>;
}

type Row = ScannedProduct & { sales?: number; revenue?: number };

function Th({ k, label, sort, dir, onSort }: { k: SortKey; label: string; sort: SortKey; dir: 1 | -1; onSort: (k: SortKey) => void }) {
  return <th><button className="thsort" onClick={() => onSort(k)}>{label} {sort === k ? (dir === 1 ? "↓" : "↑") : "↕"}</button></th>;
}

export function alibabaUrl(title: string): string {
  const words = title.replace(/[®™©,()|\-–—"“”]/g, " ").split(/\s+/).filter(Boolean).slice(0, 6).join(" ");
  return `https://www.alibaba.com/trade/search?SearchText=${encodeURIComponent(words)}`;
}

function ScanRow({ p, trend, onUsePrice }: { p: Row; trend?: Trend; onUsePrice: () => void }) {
  return <article className="scanrow">
    <div className="scanpos">#{p.position}</div>
    {p.image ? <img src={p.image} alt="" loading="lazy" /> : <div className="scanimg" />}
    <div className="scanmain">
      <a href={p.url} target="_blank" rel="noreferrer" className="prodtitle">{p.title}</a>
      <div className="prodmeta">{[p.brand, p.seller ? `Vânzător: ${p.seller}` : undefined, p.pnk, p.fbe === undefined ? undefined : p.fbe ? "FBE" : "FBM"].filter(Boolean).join(" · ")}{trend?.reviewDelta !== undefined && <span className="trend"><TrendingUp size={11} /> +{trend.reviewDelta} recenzii în {num(trend.days, 1)} zile</span>}</div>
      <div className="scanstats">
        <div><small>Preț</small><strong>{lei(p.price)}</strong>{p.oldPrice && p.price && p.oldPrice > p.price ? <s>{lei(p.oldPrice)}</s> : null}</div>
        <div><small>Rating</small><strong>{p.rating ? `★ ${num(p.rating, 1)}` : "–"}</strong></div>
        <div><small>Recenzii</small><strong>{num(p.reviews)}</strong></div>
        <div><small>Unități/lună*</small><strong>{num(p.sales)}</strong></div>
        <div><small>Venit/lună*</small><strong>{lei(p.revenue)}</strong></div>
        <div><small>Sursă</small><strong><a href={alibabaUrl(p.title)} target="_blank" rel="noreferrer">Alibaba</a></strong></div>
      </div>
    </div>
    {p.price !== undefined && <button className="secondary scancalc" onClick={onUsePrice} title="Calculează profitul la acest preț"><Calculator size={14} /></button>}
  </article>;
}

function Diagnostic({ result, quiet }: { result: ScanResult; quiet?: boolean }) {
  const text = JSON.stringify({ debug: result.debug, samples: result.samples, first: result.products.slice(0, 2) }, null, 1).slice(0, 12000);
  const [copied, setCopied] = useState(false);
  if (quiet) return <div style={{ marginTop: 6 }}>
    <button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copiat ✓" : "Copiază diagnosticul"}</button>
    <textarea readOnly value={text} style={{ width: "100%", height: 120, fontSize: 10, marginTop: 6 }} />
  </div>;
  return <div className="panel scanerror">
    <AlertTriangle size={18} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <strong>Unele date (preț, recenzii) nu au putut fi citite.</strong>
      <p>Apasă „Copiază diagnosticul” și lipește textul în chat, ca să ajustez citirea paginii.</p>
      <button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copiat ✓" : "Copiază diagnosticul"}</button>
      <details style={{ marginTop: 8 }}><summary className="footnote">Vezi textul</summary><textarea readOnly value={text} style={{ width: "100%", height: 160, fontSize: 10 }} /></details>
    </div>
  </div>;
}
