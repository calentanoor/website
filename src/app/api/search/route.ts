import type { NextRequest } from "next/server";
import { searchSymbols } from "@/lib/market-data";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();
  if (!q) return Response.json({ results: [] });
  try {
    return Response.json({ results: await searchSymbols(q) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
