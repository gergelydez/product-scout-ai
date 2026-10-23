"use client";

import { useEffect, useState } from "react";
import seed from "./seed.json";
import { newId, type Product } from "./types";

const LS_KEY = "scout-products";
const LS_PASS = "scout-app-key";

export type SyncState =
  | { kind: "local" }               // fără server: doar pe acest dispozitiv
  | { kind: "loading" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "password" }            // serverul cere parola aplicației
  | { kind: "error"; message: string };

type State = { products: Product[]; savedAt?: string; sync: SyncState; ready: boolean };

let state: State = { products: [], sync: { kind: "loading" }, ready: false };
const listeners = new Set<(s: State) => void>();
let started = false;
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function emit(patch: Partial<State>) {
  state = { ...state, ...patch };
  listeners.forEach(l => l(state));
}

function readLocal(): { products: Product[]; savedAt?: string } | null {
  try { const v = localStorage.getItem(LS_KEY); return v ? JSON.parse(v) : null; } catch { return null; }
}
function writeLocal(products: Product[], savedAt: string) {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ products, savedAt })); } catch {}
}
const appKey = () => { try { return localStorage.getItem(LS_PASS) ?? ""; } catch { return ""; } };

async function api(method: "GET" | "PUT", body?: unknown) {
  const res = await fetch("/api/products", {
    method,
    headers: { "Content-Type": "application/json", "x-app-key": appKey() },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return { status: res.status, data: await res.json().catch(() => ({})) as Record<string, unknown> };
}

async function pushToServer() {
  emit({ sync: { kind: "saving" } });
  try {
    const { status, data } = await api("PUT", { products: state.products });
    if (status === 401) return emit({ sync: { kind: "password" } });
    if (data.configured === false) return emit({ sync: { kind: "local" } });
    if (status >= 400) return emit({ sync: { kind: "error", message: String(data.error ?? `HTTP ${status}`) } });
    emit({ sync: { kind: "saved", at: String(data.savedAt) } });
  } catch (e) {
    emit({ sync: { kind: "error", message: (e as Error).message } });
  }
}

async function start() {
  if (started) return;
  started = true;
  const local = readLocal();
  const initial = local ?? { products: seed as Product[], savedAt: "1970-01-01T00:00:00Z" };
  if (!local) writeLocal(initial.products, initial.savedAt!);
  emit({ products: initial.products, savedAt: initial.savedAt, ready: true });
  try {
    const { status, data } = await api("GET");
    if (data.configured === false) return emit({ sync: { kind: "local" } });
    if (status === 401) return emit({ sync: { kind: "password" } });
    if (status >= 400) return emit({ sync: { kind: "error", message: String(data.error ?? `HTTP ${status}`) } });
    const server = data.products as Product[] | null;
    const serverAt = data.savedAt as string | undefined;
    if (server && serverAt && (!initial.savedAt || serverAt > initial.savedAt)) {
      writeLocal(server, serverAt);
      emit({ products: server, savedAt: serverAt, sync: { kind: "saved", at: serverAt } });
    } else {
      await pushToServer(); // serverul e gol sau mai vechi: urcăm lista de pe dispozitiv
    }
  } catch (e) {
    emit({ sync: { kind: "error", message: (e as Error).message } });
  }
}

function commit(products: Product[]) {
  const savedAt = new Date().toISOString();
  writeLocal(products, savedAt);
  emit({ products, savedAt });
  if (state.sync.kind === "local") return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushToServer, 800);
}

export const productsStore = {
  upsert(p: Partial<Product> & { name: string }): Product {
    const now = new Date().toISOString();
    const existing = p.id ? state.products.find(x => x.id === p.id) : undefined;
    const full: Product = { status: "idee", createdAt: now, ...existing, ...p, id: p.id ?? newId(), updatedAt: now } as Product;
    commit(existing ? state.products.map(x => (x.id === full.id ? full : x)) : [full, ...state.products]);
    return full;
  },
  remove(id: string) { commit(state.products.filter(x => x.id !== id)); },
  replaceAll(products: Product[]) { commit(products); },
  setPassword(pass: string) {
    try { localStorage.setItem(LS_PASS, pass); } catch {}
    started = false;
    start();
  },
  /** Adaugă din alt ecran (Amazon → eMAG, Scanare live); evită dublurile după cuvânt-cheie. */
  addIdea(p: Partial<Product> & { name: string }): { product: Product; duplicate: boolean } {
    const dup = state.products.find(x => (p.keyword && x.keyword?.toLowerCase() === p.keyword.toLowerCase()) || x.name === p.name);
    if (dup) return { product: dup, duplicate: true };
    return { product: productsStore.upsert(p), duplicate: false };
  },
};

export function useProducts(): State {
  const [s, setS] = useState<State>(state);
  useEffect(() => {
    listeners.add(setS);
    setS(state);
    start();
    return () => { listeners.delete(setS); };
  }, []);
  return s;
}
