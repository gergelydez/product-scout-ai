import { calculate, type CalcResult, type CalcSettings } from "../importCalc";
import { feeFor } from "./fees";
import type { Product } from "./types";

export type ProductCalc = {
  fee: ReturnType<typeof feeFor>;
  air?: CalcResult;
  sea?: CalcResult;
  missing: string[];
};

/** Calculul pentru un produs: setările generale, suprascrise de taxa vamală, comisionul și costurile proprii. */
export function calcProduct(p: Product, s: CalcSettings, usdRon: number | undefined): ProductCalc {
  const fee = feeFor(p.categoryId, p.feeOverride, s.emagCommissionPct);
  const missing: string[] = [];
  if (!p.costUsd) missing.push("cost Alibaba");
  if (!p.weightKg) missing.push("greutate");
  if (!p.priceRon) missing.push("preț eMAG");
  if (!usdRon || !p.costUsd) return { fee, missing };
  const base: CalcSettings = {
    ...s,
    customsPct: p.dutyPct ?? s.customsPct,
    emagCommissionPct: fee.pct,
    otherCostLei: s.otherCostLei + (p.shipRon ?? 0),
  };
  const input = { aliPriceUsd: p.costUsd, weightKg: p.weightKg ?? 0, salePrice: p.priceRon ?? undefined };
  return {
    fee, missing,
    air: calculate(input, base, usdRon),
    sea: calculate(input, { ...base, shippingUsdPerKg: s.seaUsdPerKg }, usdRon),
  };
}
