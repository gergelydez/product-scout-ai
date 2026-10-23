"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, RefreshCw, X, SlidersHorizontal, Download, Upload, Cloud, CloudOff, Loader2, ExternalLink, ScanSearch, Calculator, Pencil, Trash2, ChevronDown, Lock } from "lucide-react";
import { calcProduct } from "@/lib/products/calc";
import { STATUSES, type Product, type Status } from "@/lib/products/types";
import { productsStore, useProducts } from "@/lib/products/useProducts";
import { refreshFx, useCalcSettings, useFx } from "@/lib/useShared";
import type { CalcSettings } from "@/lib/importCalc";
import { emagCheckFrom } from "@/lib/opportunity";
import type { ScanResult } from "@/lib/scan/types";
import { FxBadge, type CalcPreset } from "./ImportCalculator";
import { alibabaUrl } from "./LiveScan";

const lei = (n?: number, d = 0) => (n === undefined || !Number.isFinite(n) ? "–" : `${new Intl.NumberFormat("ro-RO", { maximumFractionDigits: d, minimumFractionDigits: d }).format(n)} lei`);
const num = (n?: number | null, d = 0) => (n === undefined || n === null || !Number.isFinite(n) ? "–" : new Intl.NumberFormat("ro-RO", { maximumFractionDigits: d }).format(n));
const statusLabel = (s: Status) => STATUSES.find(x => x.id === s)?.label ?? s;

type Filter = Status | "" | "active" | "profitable";

function filterLabel(f: Filter): string {
  if (f === "") return "toate statusurile";
  if (f === "active") return "active (fără respinse)";
  if (f === "profitable") return "doar profitabile";
  return STATUSES.find(s => s.id === f)?.label ?? f;
}

type SortKey = "profit" | "profitSea" | "margin" | "roi" | "price" | "cost" | "breakEven" | "emag" | "new" | "name";

export default function MyProducts({ onOpenScan, onCalc }: { onOpenScan: (keyword: string) => void; onCalc: (p: Omit<CalcPreset, "key">) => void }) {
  const { products, sync, ready } = useProducts();
  const fx = useFx();
  const [settings] = useCalcSettings();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<Filter>("active");
  const [editCosts, setEditCosts] = useState<string | null>(null);
  // ordinea listei rămâne fixă cât timp editezi un card (altfel s-ar muta la fiecare cifră tastată)
  const frozen = useRef<string[] | null>(null);
  const [recalcAt, setRecalcAt] = useState<number>(0);
  const listRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  // după schimbarea filtrului/sortării, sărim la listă ca schimbarea să fie vizibilă pe telefon
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [status]);
  const [sort, setSort] = useState<SortKey>("profit");
  const [editing, setEditing] = useState<Product | "new" | null>(null);
  const [checking, setChecking] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products
      .filter(p => status === "" || status === "profitable" || (status === "active" ? p.status !== "respins" : p.status === status))
      .filter(p => !term || [p.name, p.category, p.keyword, p.note].some(x => x?.toLowerCase().includes(term)))
      .map(p => ({ p, c: calcProduct(p, settings, fx?.USD) }))
      .filter(r => status !== "profitable" || (r.p.status !== "respins" && (r.c.air?.at?.netProfit ?? 0) > 0))
      .sort((a, b) => {
        if (frozen.current) {
          const ia = frozen.current.indexOf(a.p.id), ib = frozen.current.indexOf(b.p.id);
          return (ia < 0 ? -1 : ia) - (ib < 0 ? -1 : ib);
        }
        const v = (r: typeof a): number | string => {
          switch (sort) {
            case "profit": return r.c.air?.at?.netProfit ?? -1e9;
            case "profitSea": return r.c.sea?.at?.netProfit ?? -1e9;
            case "margin": return r.c.air?.at?.marginPct ?? -1e9;
            case "roi": return r.c.air?.at?.roiPct ?? -1e9;
            case "price": return r.p.priceRon ?? -1;
            case "cost": return r.p.costUsd ?? -1;
            case "breakEven": return -(r.c.air?.breakEvenPrice ?? 1e9);
            case "emag": return -(r.p.emagCheck?.total ?? r.p.emagResults ?? 1e9);
            case "new": return r.p.createdAt;
            case "name": return r.p.name;
          }
        };
        const x = v(a), y = v(b);
        return typeof x === "string" ? (sort === "name" ? x.localeCompare(String(y)) : String(y).localeCompare(x)) : (y as number) - x;
      });
  }, [products, q, status, sort, settings, fx, recalcAt, editCosts]);
  useEffect(() => { if (!editCosts) frozen.current = null; }, [editCosts]);

  const summary = useMemo(() => {
    const calcs = products.filter(p => p.status !== "respins").map(p => calcProduct(p, settings, fx?.USD));
    const profitable = calcs.filter(c => (c.air?.at?.netProfit ?? 0) > 0);
    return {
      total: products.length,
      byStatus: Object.fromEntries(STATUSES.map(s => [s.id, products.filter(p => p.status === s.id).length])) as Record<Status, number>,
      profitable: profitable.length,
      avgProfit: profitable.length ? profitable.reduce((a, c) => a + c.air!.at!.netProfit, 0) / profitable.length : undefined,
    };
  }, [products, settings, fx]);

  async function checkEmag(p: Product) {
    if (!p.keyword) { setEditing(p); return; }
    setChecking(p.id);
    try {
      const r: ScanResult = await (await fetch(`/api/scan?source=emag&q=${encodeURIComponent(p.keyword)}`)).json();
      const c = emagCheckFrom(p.keyword, r);
      if (c.ok) productsStore.upsert({ ...p, emagResults: c.totalResults ?? c.found, emagCheck: { at: c.checkedAt, total: c.totalResults, found: c.found, medianPrice: c.medianPrice, minPrice: c.minPrice, avgReviewsTop10: c.avgReviewsTop10 } });
      else alert(`Verificarea pe eMAG nu a reușit: ${c.error ?? ""}`);
    } finally { setChecking(null); }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(products, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `produse-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  }
  async function importJson(file: File) {
    try {
      const list = JSON.parse(await file.text()) as Product[];
      if (!Array.isArray(list)) throw new Error("Fișierul nu conține o listă.");
      const byId = new Map(products.map(p => [p.id, p]));
      const now = new Date().toISOString();
      for (const p of list) {
        if (!p?.name) continue;
        const id = p.id ?? `p-${Math.random().toString(36).slice(2)}`;
        const defaults: Partial<Product> = { status: "idee", createdAt: now, updatedAt: now };
        byId.set(id, { ...defaults, ...byId.get(id), ...p, id } as Product);
      }
      productsStore.replaceAll([...byId.values()]);
      alert(`Importat: ${list.length} produse (cele existente cu același id au fost actualizate).`);
    } catch (e) { alert(`Import eșuat: ${(e as Error).message}`); }
  }

  return <section className="mp">
    <div className="mphead">
      <div>
        <h2 className="mptitle">Produsele mele</h2>
        <p className="mpsub">Ideile tale de produse, cu profitul calculat la cursul BNR de azi, cu comisionul eMAG pe categorie, TVA și impozitul pe profit. Fiecare produs e calculat pentru transport cu avionul și maritim.</p>
      </div>
      <div className="mpheadbtns">
        <SyncBadge sync={sync} />
        <button className="mpbtn primary" onClick={() => setEditing("new")}><Plus size={15} /> Adaugă produs</button>
      </div>
    </div>

    {sync.kind === "password" && <PasswordBox />}

    <div className="mpsummary">
      <button className={status === "" ? "on" : ""} onClick={() => setStatus("")}><b>{summary.total}</b><span>toate produsele</span></button>
      {STATUSES.map(s => <button key={s.id} className={`st-${s.id} ${status === s.id ? "on" : ""}`} onClick={() => setStatus(s.id)}><b>{summary.byStatus[s.id]}</b><span>{s.label}</span></button>)}
      <button className={`good ${status === "profitable" ? "on" : ""}`} onClick={() => setStatus("profitable")}><b>{summary.profitable}</b><span>profitabile (avion)</span></button>
      <button className={status === "active" ? "on" : ""} onClick={() => setStatus("active")}><b>{lei(summary.avgProfit)}</b><span>profit mediu · active</span></button>
    </div>

    <div className="mpbar">
      <label className="mpsearch"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Caută după nume, categorie, notă" aria-label="Caută" /></label>
      <select value={status} onChange={e => setStatus(e.target.value as Filter)} aria-label="Filtru status">
        <option value="active">Active (fără respinse)</option>
        <option value="">Toate statusurile</option>
        <option value="profitable">Doar profitabile (avion)</option>
        {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <select value={sort} onChange={e => setSort(e.target.value as SortKey)} aria-label="Sortează">
        <option value="profit">Profit net / buc (avion)</option>
        <option value="profitSea">Profit net / buc (maritim)</option>
        <option value="margin">Marjă netă %</option>
        <option value="roi">Randament pe banii avansați</option>
        <option value="breakEven">Preț minim de intrare</option>
        <option value="emag">Concurență eMAG (rezultate)</option>
        <option value="price">Preț eMAG</option>
        <option value="cost">Cost Alibaba</option>
        <option value="new">Data adăugării</option>
        <option value="name">Nume</option>
      </select>
    </div>
    <div className="mptools">
      <FxBadge />
      <button className="mpbtn primary" onClick={async () => { await refreshFx(); setRecalcAt(Date.now()); }}><RefreshCw size={14} /> Recalculează</button>
      {recalcAt > 0 && <span className="mpsettings">Recalculat la {new Date(recalcAt).toLocaleTimeString("ro-RO")} ✓</span>}
      <div className="mptoolbtns">
        <button className="mpbtn" onClick={exportJson}><Download size={14} /> Export</button>
        <button className="mpbtn" onClick={() => fileRef.current?.click()}><Upload size={14} /> Import JSON</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ""; }} />
      </div>
    </div>

    <QuickCosts />

    <div className="mpresult" ref={listRef}>
      <span>Afișez <b>{rows.length}</b> din {products.length} produse · {filterLabel(status)}{q ? ` · „${q}”` : ""}</span>
      {(status !== "active" || q) && <button className="mpbtn" onClick={() => { setStatus("active"); setQ(""); }}><X size={12} /> Resetează</button>}
    </div>

    <div className="mplist">
      {!ready && <div className="mpempty">Se încarcă lista…</div>}
      {ready && !rows.length && <div className="mpempty">Niciun produs pentru filtrul ales.</div>}
      {rows.map(({ p, c }) => {
        const air = c.air?.at, sea = c.sea?.at;
        const isOpen = open === p.id;
        return <article key={p.id} className={`mpcard ${p.status === "respins" ? "dim" : ""}`}>
          <div className="mpcardtop">
            <div style={{ minWidth: 0 }}>
              <div className="mpcat">{p.category ?? "Fără categorie"}{p.hsCode ? ` · HS ${p.hsCode}` : ""}</div>
              <h3>{p.name}</h3>
              <div className="mpkw">{p.keyword ? <>cuvânt eMAG: <b>„{p.keyword}”</b></> : "fără cuvânt-cheie"}{p.emagCheck ? <> · {num(p.emagCheck.total ?? p.emagCheck.found)} rezultate, median {lei(p.emagCheck.medianPrice)}</> : p.emagResults ? <> · {num(p.emagResults)} rezultate</> : null}</div>
            </div>
            <select className={`mppill st-${p.status}`} value={p.status} onChange={e => productsStore.upsert({ ...p, status: e.target.value as Status })} aria-label="Status">
              {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>

          <div className="mpnums">
            <div><span>Preț eMAG</span><b>{lei(p.priceRon ?? undefined)}</b></div>
            <div><span>Cost Alibaba</span><b>{p.costUsd ? `${num(p.costUsd, 2)} $` : "–"}</b></div>
            <div><span>Cost în RO (avion)</span><b>{lei(c.air?.landedLei)}</b></div>
            <div><span>Profit net avion</span><b className={air ? (air.netProfit > 0 ? "pos" : "neg") : ""}>{lei(air?.netProfit)}</b></div>
            <div><span>Profit net maritim</span><b className={sea ? (sea.netProfit > 0 ? "pos" : "neg") : ""}>{lei(sea?.netProfit)}</b></div>
            <div><span>Marjă · ROI</span><b>{air ? `${air.marginPct.toFixed(0)}% · ${air.roiPct.toFixed(0)}%` : "–"}</b></div>
            <div><span>Preț minim (avion)</span><b>{lei(c.air?.breakEvenPrice)}</b></div>
            <div><span>Comision eMAG</span><b>{c.fee.pct}% <em className="mpfeetag">{c.fee.source}</em></b></div>
          </div>
          {editCosts === p.id
            ? <InlineCosts p={p} defaults={settings} onDone={() => { frozen.current = null; setEditCosts(null); }} />
            : <button className="mpedit" onClick={() => { frozen.current = rows.map(r => r.p.id); setEditCosts(p.id); }}><Pencil size={12} /> Editează costuri și prețuri</button>}
          {c.missing.length > 0 && <div className="mpwarn">Lipsește: {c.missing.join(", ")}</div>}
          {p.emagCheck?.minPrice !== undefined && c.air && c.air.breakEvenPrice > p.emagCheck.minPrice && <div className="mpwarn">Cel mai mic preț pe eMAG ({lei(p.emagCheck.minPrice)}) e sub prețul tău minim ({lei(c.air.breakEvenPrice)}).</div>}
          <span className={`mpver ${p.pricesVerified ? "ok" : "est"}`}>{p.pricesVerified ? "Prețuri verificate" : "Prețuri estimate"}</span>

          <div className="mpactions">
            <div className="mplinks">
              {p.link && <a href={p.link} target="_blank" rel="noreferrer">Furnizor <ExternalLink size={11} /></a>}
              {!p.link && <a href={alibabaUrl(p.keywordEn || p.name)} target="_blank" rel="noreferrer">Caută pe Alibaba <ExternalLink size={11} /></a>}
              {p.emagLink && <a href={p.emagLink} target="_blank" rel="noreferrer">eMAG <ExternalLink size={11} /></a>}
              {p.competitorLink && <a href={p.competitorLink} target="_blank" rel="noreferrer">Concurent{p.priceSource ? ` (${p.priceSource})` : ""} <ExternalLink size={11} /></a>}
            </div>
            <button className="mpbtn" onClick={() => checkEmag(p)} disabled={checking === p.id}>{checking === p.id ? <Loader2 size={13} className="spin" /> : <ScanSearch size={13} />} Verifică eMAG</button>
            {p.keyword && <button className="mpbtn" onClick={() => onOpenScan(p.keyword!)}>Scan</button>}
            <button className="mpbtn" onClick={() => onCalc({ title: p.keyword ?? p.name, salePrice: p.priceRon ?? undefined, aliUsd: p.costUsd ?? undefined, kg: p.weightKg ?? undefined, minPrice: p.emagCheck?.minPrice, medianPrice: p.emagCheck?.medianPrice })}><Calculator size={13} /></button>
            <button className="mpbtn" onClick={() => setEditing(p)} aria-label="Editează"><Pencil size={13} /></button>
            <button className="mpbtn" onClick={() => setOpen(isOpen ? null : p.id)} aria-label="Detalii"><ChevronDown size={13} style={{ transform: isOpen ? "rotate(180deg)" : undefined }} /></button>
          </div>

          {isOpen && <div className="mpdetails">
            {p.note && <p className="mpnote">{p.note}</p>}
            {c.air && <Breakdown p={p} c={c} />}
            {p.desc && <details><summary>Descriere furnizor</summary><p className="mpnote">{p.desc}</p></details>}
            <div className="mpmeta">MOQ {num(p.moq)} · {num(p.weightKg, 2)} kg · taxă vamală {p.dutyPct ?? settings.customsPct}% · adăugat {new Date(p.createdAt).toLocaleDateString("ro-RO")}</div>
            <button className="mpbtn danger" onClick={() => { if (confirm(`Ștergi „${p.name}”?`)) productsStore.remove(p.id); }}><Trash2 size={13} /> Șterge</button>
          </div>}
        </article>;
      })}
    </div>

    {editing && <EditSheet product={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
  </section>;
}

function Breakdown({ p, c }: { p: Product; c: ReturnType<typeof calcProduct> }) {
  const a = c.air!, s = c.sea!;
  const row = (label: string, x?: number, y?: number, strong = false) => <tr className={strong ? "tot" : ""}><td>{label}</td><td>{lei(x, 2)}</td><td>{lei(y, 2)}</td></tr>;
  return <table className="mpcalc"><thead><tr><th></th><th>Avion</th><th>Maritim</th></tr></thead><tbody>
    {row("Factură (cost + comision Alibaba)", a.invoiceLei, s.invoiceLei)}
    {row("Taxe vamale", a.customsLei, s.customsLei)}
    {row("Transport", a.shippingLei, s.shippingLei)}
    {row("Cost marfă / buc", a.landedLei, s.landedLei, true)}
    {row("TVA import (se recuperează)", a.importVatLei, s.importVatLei)}
    {a.at && s.at && <>
      {row(`Venit fără TVA la ${lei(p.priceRon ?? undefined)}`, a.at.revenueNet, s.at.revenueNet)}
      {row(`Comision eMAG ${c.fee.pct}%`, a.at.emagCommission, s.at.emagCommission)}
      {row("Impozit pe profit", a.at.profitTax, s.at.profitTax)}
      {row("Profit net / buc", a.at.netProfit, s.at.netProfit, true)}
    </>}
    {row("Preț minim de intrare", a.breakEvenPrice, s.breakEvenPrice)}
  </tbody></table>;
}

function SyncBadge({ sync }: { sync: ReturnType<typeof useProducts>["sync"] }) {
  switch (sync.kind) {
    case "saved": return <span className="mpsync ok" title={`Salvat ${new Date(sync.at).toLocaleString("ro-RO")}`}><Cloud size={13} /> Salvat în cloud</span>;
    case "saving": case "loading": return <span className="mpsync"><Loader2 size={13} className="spin" /> Sincronizez…</span>;
    case "password": return <span className="mpsync warn"><Lock size={13} /> Necesită parolă</span>;
    case "error": return <span className="mpsync warn" title={sync.message}><CloudOff size={13} /> Eroare cloud – salvat pe telefon</span>;
    default: return <span className="mpsync" title="Configurează Upstash Redis în Vercel pentru salvare în cloud"><CloudOff size={13} /> Salvat doar pe acest telefon</span>;
  }
}

function PasswordBox() {
  const [v, setV] = useState("");
  return <div className="mppass"><Lock size={15} /> Lista din cloud e protejată cu parolă.
    <input type="password" value={v} onChange={e => setV(e.target.value)} placeholder="Parola aplicației" />
    <button className="mpbtn primary" onClick={() => productsStore.setPassword(v)}>Deblochează</button>
  </div>;
}

const FIELDS: { k: keyof Product; label: string; type?: "number" | "url" | "textarea"; step?: string; full?: boolean; placeholder?: string }[] = [
  { k: "name", label: "Nume produs *", full: true, placeholder: "ex. Lampă LED birou cu încărcare wireless" },
  { k: "keyword", label: "Cuvânt-cheie eMAG", placeholder: "ex. adaptor carplay wireless" },
  { k: "keywordEn", label: "Cuvânt-cheie EN (Alibaba)", placeholder: "ex. wireless carplay adapter" },
  { k: "category", label: "Categorie eMAG" },
  { k: "feeOverride", label: "Comision eMAG % (gol = după categorie)", type: "number", step: "0.5" },
  { k: "costUsd", label: "Cost / buc (USD, fără TVA)", type: "number", step: "0.01" },
  { k: "weightKg", label: "Greutate / buc cu ambalaj (kg)", type: "number", step: "0.01" },
  { k: "priceRon", label: "Preț vânzare eMAG (lei cu TVA)", type: "number", step: "0.1" },
  { k: "dutyPct", label: "Taxă vamală % (gol = implicit)", type: "number", step: "0.1" },
  { k: "hsCode", label: "Cod HS" },
  { k: "shipRon", label: "Alte costuri / buc (lei)", type: "number", step: "0.1" },
  { k: "moq", label: "MOQ (buc)", type: "number", step: "1" },
  { k: "link", label: "Link furnizor (Alibaba / Made-in-China)", type: "url", full: true },
  { k: "emagLink", label: "Link produs eMAG (concurent)", type: "url", full: true },
  { k: "competitorLink", label: "Link alt concurent (Okazii etc.)", type: "url", full: true },
  { k: "note", label: "Note (concurență, recenzii, furnizor)", type: "textarea", full: true },
  { k: "desc", label: "Descriere furnizor", type: "textarea", full: true },
];

function EditSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const [f, setF] = useState<Partial<Product>>(product ?? { status: "idee" });
  const [msg, setMsg] = useState("");
  const set = (k: keyof Product, v: string, type?: string) => setF(x => ({ ...x, [k]: type === "number" ? (v === "" ? null : Number(v)) : v }));
  return <div className="mpsheet" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <form onSubmit={e => {
      e.preventDefault();
      if (!f.name?.trim()) { setMsg("Scrie numele produsului."); return; }
      productsStore.upsert({ ...f, name: f.name.trim() } as Product);
      onClose();
    }}>
      <h3>{product ? "Editează produsul" : "Produs nou"}</h3>
      <div className="mpform">
        {FIELDS.map(fl => <div key={fl.k} className={`mpfield ${fl.full ? "full" : ""}`}>
          <label>{fl.label}</label>
          {fl.type === "textarea"
            ? <textarea rows={3} value={(f[fl.k] as string) ?? ""} onChange={e => set(fl.k, e.target.value)} />
            : <input type={fl.type ?? "text"} step={fl.step} inputMode={fl.type === "number" ? "decimal" : undefined} placeholder={fl.placeholder} value={(f[fl.k] as string | number | null) ?? ""} onChange={e => set(fl.k, e.target.value, fl.type)} />}
        </div>)}
        <div className="mpfield"><label>Status</label><select value={f.status} onChange={e => setF(x => ({ ...x, status: e.target.value as Status }))}>{STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</select></div>
        <label className="mpcheck"><input type="checkbox" checked={!!f.pricesVerified} onChange={e => setF(x => ({ ...x, pricesVerified: e.target.checked }))} /> Am verificat prețul de pe eMAG și costul furnizorului</label>
      </div>
      <p className="mpmsg">{msg}</p>
      <div className="mpformactions"><button type="button" className="mpbtn" onClick={onClose}>Renunță</button><button type="submit" className="mpbtn primary">Salvează</button></div>
    </form>
  </div>;
}

export { statusLabel };

/** Câmp numeric care salvează la fiecare modificare (calculul se reface imediat). */
function NumField({ label, value, step, suffix, placeholder, onChange }: { label: string; value: number | null | undefined; step: string; suffix?: string; placeholder?: string; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value === null || value === undefined ? "" : String(value));
  useEffect(() => { setText(value === null || value === undefined ? "" : String(value)); }, [value]);
  return <label className="mpnum">
    <span>{label}</span>
    <div><input type="number" inputMode="decimal" step={step} value={text} placeholder={placeholder}
      onChange={e => { setText(e.target.value); const v = e.target.value.replace(",", "."); onChange(v === "" ? null : Number(v)); }} />{suffix && <em>{suffix}</em>}</div>
  </label>;
}

function InlineCosts({ p, defaults, onDone }: { p: Product; defaults: CalcSettings; onDone: () => void }) {
  const set = (patch: Partial<Product>) => productsStore.upsert({ ...p, ...patch });
  return <div className="mpinline">
    <NumField label="Cost Alibaba" suffix="$" step="0.01" value={p.costUsd} onChange={v => set({ costUsd: v })} />
    <NumField label="Greutate" suffix="kg" step="0.05" value={p.weightKg} onChange={v => set({ weightKg: v })} />
    <NumField label="Preț eMAG" suffix="lei" step="1" value={p.priceRon} onChange={v => set({ priceRon: v })} />
    <NumField label="Comision eMAG" suffix="%" step="0.5" value={p.feeOverride} placeholder="categorie" onChange={v => set({ feeOverride: v })} />
    <NumField label="Taxă vamală" suffix="%" step="0.1" value={p.dutyPct} placeholder={String(defaults.customsPct)} onChange={v => set({ dutyPct: v })} />
    <NumField label="Alte costuri/buc" suffix="lei" step="0.5" value={p.shipRon} placeholder="0" onChange={v => set({ shipRon: v })} />
    <button className="mpbtn primary" onClick={onDone}>Gata</button>
  </div>;
}

/** Costurile generale, comune pentru toată aplicația (Produsele mele, Amazon → eMAG, Calculator). */
function QuickCosts() {
  const [s, setS] = useCalcSettings();
  const [open, setOpen] = useState(false);
  const set = (k: keyof CalcSettings) => (v: number | null) => setS({ ...s, [k]: v ?? 0 });
  return <div className="mpquick">
    <button className="mpquickhead" onClick={() => setOpen(o => !o)}>
      <SlidersHorizontal size={14} />
      <span>Transport <b>{s.shippingUsdPerKg} $/kg</b> avion · <b>{s.seaUsdPerKg} $/kg</b> maritim · comision implicit <b>{s.emagCommissionPct}%</b> · alte costuri <b>{s.otherCostLei} lei</b></span>
      <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined, marginLeft: "auto" }} />
    </button>
    {open && <div className="mpinline">
      <NumField label="Transport avion" suffix="$/kg" step="0.5" value={s.shippingUsdPerKg} onChange={set("shippingUsdPerKg")} />
      <NumField label="Transport maritim" suffix="$/kg" step="0.5" value={s.seaUsdPerKg} onChange={set("seaUsdPerKg")} />
      <NumField label="Comision Alibaba" suffix="%" step="0.5" value={s.aliCommissionPct} onChange={set("aliCommissionPct")} />
      <NumField label="Taxă vamală implicită" suffix="%" step="0.5" value={s.customsPct} onChange={set("customsPct")} />
      <NumField label="Comision eMAG implicit" suffix="%" step="0.5" value={s.emagCommissionPct} onChange={set("emagCommissionPct")} />
      <NumField label="Livrare/ambalaj/buc" suffix="lei" step="1" value={s.otherCostLei} onChange={set("otherCostLei")} />
      <NumField label="TVA" suffix="%" step="1" value={s.vatPct} onChange={set("vatPct")} />
      <NumField label="Impozit pe profit" suffix="%" step="1" value={s.profitTaxPct} onChange={set("profitTaxPct")} />
      <NumField label="Marjă țintă" suffix="%" step="1" value={s.targetMarginPct} onChange={set("targetMarginPct")} />
      <p className="mpsettings" style={{ gridColumn: "1/-1", margin: 0 }}>Se aplică imediat peste tot: Produsele mele, Amazon → eMAG și Calculator. Valorile puse pe un produs (taxă vamală, comision) au prioritate.</p>
    </div>}
  </div>;
}
