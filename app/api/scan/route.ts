import { NextResponse } from "next/server";
import { scan } from "@/lib/scan/sources";
import type { Source } from "@/lib/scan/types";

export const dynamic = "force-dynamic";
// Rulează funcția aproape de România (Frankfurt) pe Vercel.
export const preferredRegion = ["fra1"];
export const maxDuration = 150;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim().slice(0, 120);
  const source = searchParams.get("source") === "trendyol" ? "trendyol" : "emag" as Source;
  if (q.length < 2) return NextResponse.json({ ok: false, error: "Scrie cel puțin 2 caractere." }, { status: 400 });
  const result = await scan(source, q);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
