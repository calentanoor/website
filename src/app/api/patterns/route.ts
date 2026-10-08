import type { NextRequest } from "next/server";
import { getIndex } from "@/lib/indices";
import { scanPatterns } from "@/lib/screener";

// GET /api/patterns?index=dax,nasdaq100&symbols=AAPL → { rows }
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const split = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
  const symbols = new Set<string>();
  for (const id of split(params.get("index"))) getIndex(id)?.constituents?.forEach((s) => symbols.add(s));
  for (const s of split(params.get("symbols"))) symbols.add(s.toUpperCase());
  if (symbols.size > 300) return Response.json({ error: "Maximal 300 Werte" }, { status: 400 });
  return Response.json({ rows: symbols.size ? await scanPatterns([...symbols]) : [] });
}
