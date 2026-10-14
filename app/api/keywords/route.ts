import { NextResponse } from "next/server";
import { toRomanianKeywords } from "@/lib/keywords";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null) as { titles?: unknown } | null;
  const titles = Array.isArray(body?.titles) ? body.titles.filter((t): t is string => typeof t === "string").slice(0, 60).map(t => t.slice(0, 300)) : [];
  if (!titles.length) return NextResponse.json({ error: "Lipsesc titlurile." }, { status: 400 });
  return NextResponse.json(await toRomanianKeywords(titles));
}
