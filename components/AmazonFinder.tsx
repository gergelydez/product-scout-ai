"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Download, Sparkles, AlertTriangle, ScanSearch, ExternalLink } from "lucide-react";
import type { AmazonListResult } from "@/app/api/amazon/route";
import { CATEGORIES, MARKETS, type ListType, type Market } from "@/lib/amazon/categories";
import type { AmazonProduct } from "@/lib/amazon/parse";
import { emagCheckFrom, FX_RON, scoreOpportunity, type EmagCheck } from "@/lib/opportunity";
import type { ScanResult } from "@/lib/scan/types";
import { alibabaUrl } from "./LiveScan";

type Row = { product: AmazonProduct; keyword: string; check?: EmagCheck };
type Saved = { rows: Row[]; fetchedAt: string; engine?: string; url: string; market: Market };

const CACHE_KEY = "scout-amazon-finder";
const fmt = (n?: number, d = 0) => (n === undefined ? "–" : new Intl.NumberFormat("ro-RO", { maximumFractionDigits: d }).format(n));
const lei = (n?: number) => (n === undefined ? "–" : `${fmt(n)} lei`);

function loadCache(): Record<string, Saved> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; }
}
function saveCache(key: string, v: Saved) {
  try { const all = loadCache(); all[key] = v; localStorage.setItem(CACHE_KEY, JSON.stringify(all)); } catch {}
}

export default function AmazonFinder({ onOpenScan }: { onOpenScan: (keyword: string) => void }) {
  const [market, setMarket] = useState<Market>("uk");
  const [list, setList] = useState<ListType>("movers");
  const [category, setCategory] = useState("kitchen");
  const [customUrl, setCustomUrl] = useState("");
  const [loading, setLoading] = useState<string>("");
  const [error, setError] = useState<{ msg: string; debug?: string[]; url?: string } | null>(null);
  const [data, setData] = useState<Saved | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [onlyGood, setOnlyGood] = useState(false);

  const cacheKey = customUrl.trim() ? `url:${customUrl.trim()}` : `${market}|${list}|${category}`;

  useEffect(() => {
    const c = loadCache()[cacheKey];
    setData(c ?? null);
    setSelected(new Set(c?.rows.slice(0, 10).map(r => r.product.asin) ?? []));
    setError(null);
  }, [cacheKey]);

  function persist(next: Saved) { setData(next); saveCache(cacheKey, next); }

  async function load() {
    setError(null);
    setLoading("Citesc topul Amazon…");
    try {
      const params = new URLSearchParams(customUrl.trim() ? { url: customUrl.trim() } : { market, list, category });
      const r: AmazonListResult = await (await fetch(`/api/amazon?${params}`)).json();
      if (!r.ok) { setError({ msg: r.error ?? "Eroare necunoscută", debug: r.debug, url: r.url }); return; }
      setLoading(`Traduc ${r.products.length} titluri în cuvinte-cheie românești…`);
      const k = await (await fetch("/api/keywords", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ titles: r.products.map(p => p.title) }) })).json() as { keywords?: string[]; engine?: string };
      const rows = r.products.map((p, i) => ({ product: p, keyword: k.keywords?.[i] || p.title.split(/\s+/).slice(0, 4).join(" ").toLowerCase() }));
      persist({ rows, fetchedAt: r.fetchedAt, engine: k.engine, url: r.url, market: r.market });
      setSelected(new Set(rows.slice(0, 10).map(x => x.product.asin)));
    } catch (e) {
      setError({ msg: (e as Error).message });
    } finally { setLoading(""); }
  }

  async function validate() {
    if (!data) return;
    const targets = data.rows.filter(r => selected.has(r.product.asin));
    let rows = [...data.rows];
    let done = 0;
    const queue = [...targets];
    const worker = async () => {
      while (queue.length) {
        const t = queue.shift()!;
        setLoading(`Verific pe eMAG ${++done}/${targets.length}: „${t.keyword}”`);
        let check: EmagCheck;
        try {
          const r: ScanResult = await (await fetch(`/api/scan?source=emag&q=${encodeURIComponent(t.keyword)}`)).json();
          check = emagCheckFrom(t.keyword, r);
        } catch (e) {
          check = { keyword: t.keyword, checkedAt: new Date().toISOString(), ok: false, error: (e as Error).message, found: 0 };
        }
        rows = rows.map(x => (x.product.asin === t.product.asin ? { ...x, check } : x));
        persist({ ...data, rows });
      }
    };
    await Promise.all([worker(), worker()]);
    setLoading("");
  }

  const currency = MARKETS[data?.market ?? market].currency;
  const scored = useMemo(() => (data?.rows ?? [])
    .map(r => ({ ...r, opp: scoreOpportunity(r.product, r.check?.keyword === r.keyword ? r.check : undefined, currency) }))
    .filter(r => !onlyGood || r.opp.label !== "Mică")
    .sort((a, b) => b.opp.score - a.opp.score || a.product.rank - b.product.rank), [data, onlyGood, currency]);

  const validatedCount = data?.rows.filter(r => r.check?.ok).length ?? 0;

  function setKeyword(asin: string, keyword: string) {
    if (!data) return;
    persist({ ...data, rows: data.rows.map(r => (r.product.asin === asin ? { ...r, keyword } : r)) });
  }
  function toggle(asin: string) {
    setSelected(s => { const n = new Set(s); n.has(asin) ? n.delete(asin) : n.add(asin); return n; });
  }

  function exportCsv() {
    const head = ["Scor", "Oportunitate", "Rang Amazon", "Produs Amazon", "ASIN", `Preț (${currency})`, "Rating", "Recenzii", "Creștere %", "Cuvânt-cheie RO", "Rezultate eMAG", "Recenzii medii top10 eMAG", "Preț median eMAG", "Unități/lună top10 eMAG*", "Motive", "Link Amazon"];
    const rows = scored.map(r => [r.opp.score, r.opp.label, r.product.rank, r.product.title, r.product.asin, r.product.price ?? "", r.product.rating ?? "", r.product.reviews ?? "", r.product.rankChangePct ?? "", r.keyword, r.check?.totalResults ?? "", r.check?.avgReviewsTop10 !== undefined ? Math.round(r.check.avgReviewsTop10) : "", r.check?.medianPrice ?? "", r.check?.top10Units ?? "", r.opp.reasons.join("; "), r.product.url]);
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v).replaceAll('"', '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `oportunitati-${cacheKey.replace(/[^a-z0-9]+/gi, "-")}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <section>
    <div className="panel" style={{ marginTop: 0 }}>
      <h3><Sparkles size={16} style={{ display: "inline", verticalAlign: "-2px" }} /> Produse validate pe Amazon → verificate pe eMAG</h3>
      <p>Ia produsele care se vând deja bine pe Amazon UK/DE (Best Sellers sau Movers & Shakers), le transformă în cuvinte-cheie românești și verifică automat cât de aglomerat e eMAG. Scorul combină cererea dovedită pe Amazon cu concurența și prețurile de pe eMAG.</p>
      <div className="finderform">
        <div className="field"><label>Piață</label><select value={market} onChange={e => setMarket(e.target.value as Market)}><option value="uk">Amazon UK</option><option value="de">Amazon DE</option></select></div>
        <div className="field"><label>Listă</label><select value={list} onChange={e => setList(e.target.value as ListType)}><option value="movers">Movers & Shakers (în creștere 24h)</option><option value="bestsellers">Best Sellers</option></select></div>
        <div className="field"><label>Categorie</label><select value={category} onChange={e => setCategory(e.target.value)}>{CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></div>
        <button className="primary" onClick={load} disabled={!!loading}>{loading.startsWith("Citesc") || loading.startsWith("Traduc") ? <Loader2 size={16} className="spin" /> : <ScanSearch size={16} />} Încarcă topul</button>
      </div>
      <details className="footnote" style={{ marginTop: 10 }}><summary>Sau lipește un link Amazon (orice subcategorie Best Sellers / Movers & Shakers)</summary>
        <input className="urlinput" value={customUrl} onChange={e => setCustomUrl(e.target.value)} placeholder="https://www.amazon.co.uk/gp/movers-and-shakers/kitchen/…" />
      </details>
    </div>

    {loading && <div className="panel progress"><Loader2 size={16} className="spin" /> {loading}</div>}

    {error && <div className="panel scanerror"><AlertTriangle size={18} /><div><strong>Nu am putut încărca lista.</strong><p>{error.msg}</p>{error.debug && <details className="footnote"><summary>Detalii tehnice</summary>{error.debug.map((d, i) => <div key={i}>{d}</div>)}</details>}{error.url && <a className="secondary" href={error.url} target="_blank" rel="noreferrer">Deschide pagina Amazon <ExternalLink size={12} /></a>}</div></div>}

    {data && <>
      <div className="sectionhead" style={{ marginTop: 18 }}>
        <div><h3>{data.rows.length} produse · {validatedCount} verificate pe eMAG</h3><p>Încărcat {new Date(data.fetchedAt).toLocaleString("ro-RO")} · cuvinte-cheie: {data.engine === "claude" ? "Claude AI" : data.engine === "google" ? "Google Translate (poți corecta manual)" : "simplificate (corectează manual)"} · curs {currency === "GBP" ? `1 £ = ${FX_RON.GBP}` : `1 € = ${FX_RON.EUR}`} lei</p></div>
      </div>
      <div className="scantools">
        <button className="primary" onClick={validate} disabled={!!loading || selected.size === 0}>Verifică pe eMAG ({selected.size} selectate)</button>
        <span className="footnote">≈ {selected.size}–{selected.size * 3} cereri ScraperAPI</span>
        <div className="seg"><button className={!onlyGood ? "active" : ""} onClick={() => setOnlyGood(false)}>Toate</button><button className={onlyGood ? "active" : ""} onClick={() => setOnlyGood(true)}>Doar Mare/Medie</button></div>
        <div className="actions" style={{ marginTop: 0, marginLeft: "auto" }}>
          <button className="secondary" onClick={() => setSelected(new Set(data.rows.filter(r => !r.check?.ok).slice(0, 10).map(r => r.product.asin)))}>Selectează următoarele 10</button>
          <button className="secondary" onClick={exportCsv}><Download size={13} /> CSV</button>
        </div>
      </div>

      <div className="scantablewrap"><table className="scantable findertable">
        <thead><tr>
          <th></th><th>Scor</th><th>#</th><th className="sticky">Produs Amazon</th><th>Preț</th><th>Rating</th><th>Recenzii</th><th>Creștere</th>
          <th>Cuvânt-cheie eMAG</th><th>Rezultate eMAG</th><th>Rec. medii top 10</th><th>Preț median eMAG</th><th>Unități/lună top 10*</th><th>De ce</th><th></th>
        </tr></thead>
        <tbody>{scored.map(({ product: p, keyword, check, opp }) => {
          const valid = check?.keyword === keyword ? check : undefined;
          return <tr key={p.asin}>
            <td><input type="checkbox" checked={selected.has(p.asin)} onChange={() => toggle(p.asin)} aria-label="Selectează" /></td>
            <td><span className={`oppscore ${opp.label.toLowerCase()}`} title={`Cerere ${Math.round(opp.demand * 100)} · Concurență ${Math.round(opp.competition * 100)}`}>{valid?.ok ? opp.score : "?"}</span></td>
            <td>{p.rank}</td>
            <td className="sticky"><div className="cellprod">{p.image ? <img src={p.image} alt="" loading="lazy" /> : <span className="scanimg" />}<a href={p.url} target="_blank" rel="noreferrer" title={p.title}>{p.title}</a></div></td>
            <td className="num">{p.price !== undefined ? <>{currency === "GBP" ? "£" : "€"}{fmt(p.price, 2)}<s style={{ textDecoration: "none" }}>≈ {lei(p.price * FX_RON[currency])}</s></> : "–"}</td>
            <td className="num">{p.rating ? <><span className="star">★</span> {fmt(p.rating, 1)}</> : "–"}</td>
            <td className="num">{fmt(p.reviews)}</td>
            <td className="num">{p.rankChangePct ? <span className="trend">+{fmt(p.rankChangePct)}%</span> : "–"}</td>
            <td><input className="kwinput" value={keyword} onChange={e => setKeyword(p.asin, e.target.value)} /></td>
            {valid?.ok
              ? <><td className="num">{fmt(valid.totalResults ?? valid.found)}</td><td className="num">{fmt(valid.avgReviewsTop10)}</td><td className="num">{lei(valid.medianPrice)}</td><td className="num">{fmt(valid.top10Units)}</td></>
              : <td colSpan={4} className="footnote">{valid ? `Eroare: ${valid.error?.slice(0, 60)}` : check ? "Cuvânt schimbat – verifică din nou" : "Neverificat"}</td>}
            <td className="reasons">{opp.reasons.join(" · ")}</td>
            <td><div style={{ display: "flex", gap: 6 }}><button className="calcbtn" onClick={() => onOpenScan(keyword)}>Scan eMAG</button><a className="secondary" href={alibabaUrl(p.title)} target="_blank" rel="noreferrer">Alibaba</a></div></td>
          </tr>;
        })}</tbody>
      </table></div>
      <p className="footnote" style={{ marginTop: 10 }}>Scor = 40% cerere Amazon (poziție, recenzii, creștere) + 40% concurență scăzută pe eMAG (rezultate, recenzii top 10) + 20% spațiu de preț (preț median eMAG vs. Amazon). *Unitățile sunt estimări. Rezultatele rămân salvate pe acest dispozitiv, ca să nu consumi credite de două ori.</p>
    </>}
  </section>;
}
