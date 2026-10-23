/**
 * Salvare pe server în Upstash Redis (REST). Se activează când în Vercel există
 * KV_REST_API_URL + KV_REST_API_TOKEN (integrarea Upstash din Vercel Marketplace)
 * sau UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.
 */
import type { Product } from "./types";

const KEY = "product-scout:products";

function config() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : undefined;
}

export const storageConfigured = () => !!config();

async function command(args: (string | number)[]): Promise<unknown> {
  const c = config();
  if (!c) throw new Error("Stocarea pe server nu e configurată.");
  const res = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `Upstash HTTP ${res.status}`);
  return data.result;
}

export async function loadProducts(): Promise<{ products: Product[] | null; savedAt?: string }> {
  const raw = await command(["GET", KEY]);
  if (typeof raw !== "string") return { products: null };
  const parsed = JSON.parse(raw) as { products: Product[]; savedAt: string };
  return parsed;
}

export async function saveProducts(products: Product[]): Promise<string> {
  const savedAt = new Date().toISOString();
  await command(["SET", KEY, JSON.stringify({ products, savedAt })]);
  // copie de siguranță a versiunii anterioare, păstrată 30 de zile
  await command(["SET", `${KEY}:backup:${savedAt.slice(0, 10)}`, JSON.stringify({ products, savedAt }), "EX", 60 * 60 * 24 * 30]);
  return savedAt;
}
