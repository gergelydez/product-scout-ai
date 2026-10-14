"use client";

import { useEffect, useState } from "react";
import type { FxRates } from "./fx";
import { DEFAULT_CALC, type CalcSettings } from "./importCalc";

let fxPromise: Promise<FxRates | undefined> | undefined;

/** Cursul BNR live (cache în memorie pentru sesiune; serverul îl reîmprospătează la 30 min). */
export function useFx(): FxRates | undefined {
  const [fx, setFx] = useState<FxRates>();
  useEffect(() => {
    fxPromise ??= fetch("/api/fx").then(r => (r.ok ? r.json() : undefined)).catch(() => undefined);
    fxPromise.then(r => { if (r) setFx(r); else fxPromise = undefined; });
  }, []);
  return fx;
}

const SETTINGS_KEY = "scout-calc-settings";
const listeners = new Set<(s: CalcSettings) => void>();

function readSettings(): CalcSettings {
  try { return { ...DEFAULT_CALC, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") }; } catch { return DEFAULT_CALC; }
}

/** Setările calculatorului, comune pentru toate ecranele și salvate pe dispozitiv. */
export function useCalcSettings(): [CalcSettings, (s: CalcSettings) => void] {
  const [s, setS] = useState<CalcSettings>(DEFAULT_CALC);
  useEffect(() => {
    setS(readSettings());
    listeners.add(setS);
    return () => { listeners.delete(setS); };
  }, []);
  const update = (next: CalcSettings) => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch {}
    listeners.forEach(l => l(next));
  };
  return [s, update];
}
