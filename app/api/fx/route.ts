import { NextResponse } from "next/server";
import { getRates } from "@/lib/fx";

export const revalidate = 1800;

export async function GET() {
  const rates = await getRates();
  if (!rates) return NextResponse.json({ error: "Nu am putut citi cursul BNR sau BCE." }, { status: 502 });
  return NextResponse.json(rates);
}
