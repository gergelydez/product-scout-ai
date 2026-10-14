/**
 * Calculator import China → eMAG pentru o firmă plătitoare de TVA.
 *
 * Valoare în vamă (DVI) = preț Alibaba + comision Alibaba (doar factura; opțional + transport)
 * Taxe vamale          = % × valoarea în vamă
 * TVA import           = % × (valoare în vamă + taxe vamale), se recuperează (plătitor de TVA)
 * Cost marfă / buc     = factură + taxe vamale + transport (USD/kg × kg), fără TVA
 *
 * Vânzare pe eMAG la prețul P (cu TVA):
 * Venit fără TVA       = P / (1 + TVA)
 * Comision eMAG        = % × P (aplicat prudent pe prețul cu TVA)
 * Profit brut          = venit fără TVA − cost marfă − comision − alte costuri / buc
 * Impozit pe profit    = % × profit brut (dacă e pozitiv)
 */

export type CalcSettings = {
  aliCommissionPct: number;
  shippingUsdPerKg: number;
  customsPct: number;
  vatPct: number;
  /** Include transportul în valoarea în vamă (pe DVI se declară de obicei doar factura) */
  shippingInCustoms: boolean;
  emagCommissionPct: number;
  /** Livrare la client / fulfilment / ambalaj per bucată, lei fără TVA */
  otherCostLei: number;
  profitTaxPct: number;
  targetMarginPct: number;
};

export const DEFAULT_CALC: CalcSettings = {
  aliCommissionPct: 3,
  shippingUsdPerKg: 10,
  customsPct: 5,
  vatPct: 21,
  shippingInCustoms: false,
  emagCommissionPct: 17,
  otherCostLei: 15,
  profitTaxPct: 16,
  targetMarginPct: 20,
};

export type CalcInput = { aliPriceUsd: number; weightKg: number; salePrice?: number };

export type CalcResult = {
  invoiceLei: number;
  shippingLei: number;
  customsBaseLei: number;
  customsLei: number;
  importVatLei: number;
  /** Cost marfă pe bucată, fără TVA (TVA de import se recuperează) */
  landedLei: number;
  /** Bani necesari la import pe bucată, inclusiv TVA de plătit în vamă */
  cashAtImportLei: number;
  /** Preț de vânzare cu TVA la care profitul e zero */
  breakEvenPrice: number;
  /** Preț de vânzare cu TVA pentru marja netă țintă */
  targetPrice: number;
  at?: SaleResult;
};

export type SaleResult = {
  price: number;
  revenueNet: number;
  vatCollected: number;
  emagCommission: number;
  profitBeforeTax: number;
  profitTax: number;
  netProfit: number;
  /** Profit net / venit fără TVA */
  marginPct: number;
  /** Profit net / cost marfă */
  roiPct: number;
};

export function sale(price: number, landed: number, s: CalcSettings): SaleResult {
  const revenueNet = price / (1 + s.vatPct / 100);
  const emagCommission = price * s.emagCommissionPct / 100;
  const profitBeforeTax = revenueNet - landed - emagCommission - s.otherCostLei;
  const profitTax = Math.max(0, profitBeforeTax) * s.profitTaxPct / 100;
  const netProfit = profitBeforeTax - profitTax;
  return {
    price, revenueNet, vatCollected: price - revenueNet, emagCommission, profitBeforeTax, profitTax, netProfit,
    marginPct: revenueNet > 0 ? netProfit / revenueNet * 100 : 0,
    roiPct: landed > 0 ? netProfit / landed * 100 : 0,
  };
}

export function calculate(input: CalcInput, s: CalcSettings, usdRon: number): CalcResult {
  const invoiceLei = input.aliPriceUsd * (1 + s.aliCommissionPct / 100) * usdRon;
  const shippingLei = input.weightKg * s.shippingUsdPerKg * usdRon;
  const customsBaseLei = invoiceLei + (s.shippingInCustoms ? shippingLei : 0);
  const customsLei = customsBaseLei * s.customsPct / 100;
  const importVatLei = (customsBaseLei + customsLei) * s.vatPct / 100;
  const landedLei = invoiceLei + customsLei + shippingLei;

  const a = 1 / (1 + s.vatPct / 100), c = s.emagCommissionPct / 100, t = 1 - s.profitTaxPct / 100, m = s.targetMarginPct / 100;
  const K = landedLei + s.otherCostLei;
  const breakEvenPrice = a - c > 0 ? K / (a - c) : Infinity;
  // t·(P·(a−c) − K) = m·P·a  →  P = t·K / (t·(a−c) − m·a)
  const denom = t * (a - c) - m * a;
  const targetPrice = denom > 0 ? t * K / denom : Infinity;

  return {
    invoiceLei, shippingLei, customsBaseLei, customsLei, importVatLei, landedLei,
    cashAtImportLei: landedLei + importVatLei,
    breakEvenPrice, targetPrice,
    at: input.salePrice ? sale(input.salePrice, landedLei, s) : undefined,
  };
}
