"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { calculate, sale, DEFAULT_CALC, type CalcSettings } from "@/lib/importCalc";
import { useCalcSettings, useFx } from "@/lib/useShared";
import { alibabaUrl } from "./LiveScan";

export type CalcPreset = { title: string; salePrice?: number; minPrice?: number; medianPrice?: number; aliUsd?: number; kg?: number; key: number };

const lei = (n?: number, d = 2) => (n === undefined || !Number.isFinite(n) ? "–" : `${new Intl.NumberFormat("ro-RO", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n)} lei`);
const pct = (n?: number) => (n === undefined || !Number.isFinite(n) ? "–" : `${n.toFixed(1)}%`);

export function FxBadge() {
  const fx = useFx();
  return <span className="fxbadge">{fx ? <>1 USD = <b>{fx.USD.toFixed(4)}</b> lei · 1 EUR = {fx.EUR.toFixed(4)} · 1 GBP = {fx.GBP.toFixed(4)} · {fx.source} {new Date(fx.date).toLocaleDateString("ro-RO")}</> : <><RefreshCw size={11} className="spin" /> curs BNR…</>}</span>;
}

export function SettingsEditor() {
  const [s, setS] = useCalcSettings();
  const field = (k: keyof CalcSettings, label: string, step = 1) => <div className="field" key={k}>
    <label>{label}</label>
    <input type="number" step={step} value={s[k] as number} onChange={e => setS({ ...s, [k]: Number(e.target.value) })} />
  </div>;
  return <div className="calcsettings">
    {field("aliCommissionPct", "Comision Alibaba %", 0.5)}
    {field("shippingUsdPerKg", "Transport avion USD/kg", 0.5)}
    {field("customsPct", "Taxe vamale %", 0.5)}
    {field("vatPct", "TVA %")}
    {field("emagCommissionPct", "Comision eMAG % (din preț cu TVA)", 0.5)}
    {field("otherCostLei", "Livrare/ambalaj/alte costuri per buc (lei)", 1)}
    {field("profitTaxPct", "Impozit pe profit %")}
    {field("targetMarginPct", "Marjă netă țintă %")}
    <label className="check"><input type="checkbox" checked={s.shippingInCustoms} onChange={e => setS({ ...s, shippingInCustoms: e.target.checked })} /> Include transportul în valoarea în vamă (implicit: pe DVI doar factura)</label>
    <button className="secondary" onClick={() => setS(DEFAULT_CALC)}>Resetează valorile</button>
  </div>;
}

export default function ImportCalculator({ preset }: { preset?: CalcPreset }) {
  const fx = useFx();
  const [s] = useCalcSettings();
  const [title, setTitle] = useState("");
  const [usd, setUsd] = useState("22");
  const [kg, setKg] = useState("0.5");
  const [price, setPrice] = useState("");
  const [minPrice, setMinPrice] = useState<number>();
  const [medianPrice, setMedianPrice] = useState<number>();

  useEffect(() => {
    if (!preset) return;
    setTitle(preset.title);
    if (preset.salePrice) setPrice(String(Math.round(preset.salePrice * 100) / 100));
    if (preset.aliUsd) setUsd(String(preset.aliUsd));
    if (preset.kg) setKg(String(preset.kg));
    setMinPrice(preset.minPrice);
    setMedianPrice(preset.medianPrice);
  }, [preset?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const usdRon = fx?.USD;
  const r = usdRon ? calculate({ aliPriceUsd: Number(usd) || 0, weightKg: Number(kg) || 0, salePrice: Number(price) || undefined }, s, usdRon) : undefined;
  const atMin = r && minPrice ? sale(minPrice, r.landedLei, s) : undefined;
  const atMedian = r && medianPrice ? sale(medianPrice, r.landedLei, s) : undefined;

  return <section className="panel" style={{ marginTop: 0 }}>
    <h3>Calculator import China → eMAG</h3>
    <p>Prețul Alibaba în USD, convertit la cursul BNR de azi. Calculul pornește de la valoarea din vamă (factura + {s.aliCommissionPct}% comision), adaugă {s.customsPct}% taxe vamale și transportul de {s.shippingUsdPerKg} USD/kg. TVA-ul de {s.vatPct}% plătit la import se recuperează, pentru că firma e plătitoare de TVA. Din profit se scade impozitul de {s.profitTaxPct}%.</p>
    <FxBadge />
    <div className="calcgrid">
      <div className="field" style={{ gridColumn: "1 / -1" }}><label>Produs</label><input value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. organizator portbagaj" /></div>
      <div className="field"><label>Preț Alibaba (USD / buc)</label><input type="number" step="0.01" value={usd} onChange={e => setUsd(e.target.value)} /></div>
      <div className="field"><label>Greutate per bucată (kg)</label><input type="number" step="0.05" value={kg} onChange={e => setKg(e.target.value)} /></div>
      <div className="field"><label>Preț de vânzare eMAG (lei cu TVA)</label><input type="number" step="1" value={price} onChange={e => setPrice(e.target.value)} placeholder={r ? Math.ceil(r.targetPrice).toString() : ""} /></div>
    </div>
    {title && <a className="secondary" style={{ marginTop: 8 }} href={alibabaUrl(title)} target="_blank" rel="noreferrer">Caută pe Alibaba <ExternalLink size={12} /></a>}

    {r && <>
      <div className="calckpis">
        <div className="kpi"><small>Cost marfă / buc (fără TVA)</small><strong>{lei(r.landedLei)}</strong></div>
        <div className="kpi warn"><small>Preț minim (profit 0)</small><strong>{lei(r.breakEvenPrice)}</strong></div>
        <div className="kpi good"><small>Preț pentru marjă {s.targetMarginPct}%</small><strong>{lei(r.targetPrice)}</strong></div>
        <div className="kpi"><small>Bani la import / buc (cu TVA)</small><strong>{lei(r.cashAtImportLei)}</strong></div>
      </div>

      {(minPrice || medianPrice) && <div className="compete">
        {minPrice !== undefined && <div className={atMin && atMin.netProfit > 0 ? "ok" : "bad"}>Cel mai mic preț pe eMAG: <b>{lei(minPrice)}</b> → profit net {lei(atMin?.netProfit)} ({pct(atMin?.marginPct)}). {r.breakEvenPrice <= minPrice ? "Poți intra sub concurență." : `Nu poți coborî sub ${lei(r.breakEvenPrice, 0)} fără pierdere.`}</div>}
        {medianPrice !== undefined && <div className={atMedian && atMedian.netProfit > 0 ? "ok" : "bad"}>Preț median eMAG: <b>{lei(medianPrice)}</b> → profit net {lei(atMedian?.netProfit)} ({pct(atMedian?.marginPct)})</div>}
      </div>}

      <table className="breakdown"><tbody>
        <tr><td>Preț Alibaba</td><td>{usd || 0} USD × {usdRon!.toFixed(4)}</td><td>{lei((Number(usd) || 0) * usdRon!)}</td></tr>
        <tr><td>+ Comision Alibaba {s.aliCommissionPct}%</td><td>factură</td><td>{lei(r.invoiceLei)}</td></tr>
        <tr><td>Taxe vamale {s.customsPct}%</td><td>din {lei(r.customsBaseLei)}</td><td>{lei(r.customsLei)}</td></tr>
        <tr className="muted"><td>TVA import {s.vatPct}% (se recuperează)</td><td>din {lei(r.customsBaseLei + r.customsLei)}</td><td>{lei(r.importVatLei)}</td></tr>
        <tr><td>Transport avion</td><td>{kg || 0} kg × {s.shippingUsdPerKg} USD</td><td>{lei(r.shippingLei)}</td></tr>
        <tr className="total"><td>Cost marfă / buc</td><td>fără TVA</td><td>{lei(r.landedLei)}</td></tr>
        {r.at && <>
          <tr className="sep"><td colSpan={3}>La prețul de vânzare {lei(r.at.price)}</td></tr>
          <tr><td>Venit fără TVA</td><td>TVA colectat {lei(r.at.vatCollected)}</td><td>{lei(r.at.revenueNet)}</td></tr>
          <tr><td>− Comision eMAG {s.emagCommissionPct}%</td><td></td><td>{lei(r.at.emagCommission)}</td></tr>
          <tr><td>− Cost marfă</td><td></td><td>{lei(r.landedLei)}</td></tr>
          <tr><td>− Livrare/alte costuri</td><td></td><td>{lei(s.otherCostLei)}</td></tr>
          <tr><td>Profit brut</td><td></td><td>{lei(r.at.profitBeforeTax)}</td></tr>
          <tr><td>− Impozit pe profit {s.profitTaxPct}%</td><td></td><td>{lei(r.at.profitTax)}</td></tr>
          <tr className={`total ${r.at.netProfit >= 0 ? "pos" : "neg"}`}><td>Profit net / buc</td><td>marjă {pct(r.at.marginPct)} · ROI {pct(r.at.roiPct)}</td><td>{lei(r.at.netProfit)}</td></tr>
        </>}
      </tbody></table>
    </>}
    {!fx && <p className="footnote">Aștept cursul BNR…</p>}

    <details style={{ marginTop: 14 }}><summary><b>Setări calculator</b> (se aplică peste tot în aplicație)</summary><SettingsEditor /></details>
    <p className="footnote">Transportul folosește greutatea reală. Dacă transportatorul taxează după volum (L×l×h/6000), folosește greutatea volumetrică, dacă e mai mare. Calculul nu înlocuiește contabilul: verifică cu el baza de calcul pentru taxe vamale și TVA.</p>
  </section>;
}
