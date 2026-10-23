import { NextResponse } from "next/server";
import { loadProducts, saveProducts, storageConfigured } from "@/lib/products/storage";
import type { Product } from "@/lib/products/types";

export const dynamic = "force-dynamic";

/** Dacă APP_PASSWORD e setat în Vercel, lista se citește/scrie doar cu parola în antetul x-app-key. */
function authorized(req: Request): boolean {
  const pass = process.env.APP_PASSWORD?.trim();
  return !pass || req.headers.get("x-app-key") === pass;
}

export async function GET(req: Request) {
  if (!storageConfigured()) return NextResponse.json({ configured: false });
  if (!authorized(req)) return NextResponse.json({ configured: true, needsPassword: true }, { status: 401 });
  try {
    const { products, savedAt } = await loadProducts();
    return NextResponse.json({ configured: true, products, savedAt });
  } catch (e) {
    return NextResponse.json({ configured: true, error: (e as Error).message }, { status: 502 });
  }
}

export async function PUT(req: Request) {
  if (!storageConfigured()) return NextResponse.json({ configured: false }, { status: 400 });
  if (!authorized(req)) return NextResponse.json({ needsPassword: true }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { products?: unknown } | null;
  if (!Array.isArray(body?.products)) return NextResponse.json({ error: "Lipsește lista de produse." }, { status: 400 });
  const products = (body.products as Product[]).filter(p => p && typeof p.id === "string" && typeof p.name === "string").slice(0, 2000);
  const size = JSON.stringify(products).length;
  if (size > 900_000) return NextResponse.json({ error: "Lista e prea mare (descrieri foarte lungi?)." }, { status: 413 });
  try {
    const savedAt = await saveProducts(products);
    return NextResponse.json({ ok: true, savedAt, count: products.length });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
