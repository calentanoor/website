import type { NextRequest } from "next/server";
import { getIndex } from "@/lib/indices";
import { buildRows } from "@/lib/screener";

const MAX_SYMBOLS = 300;

// GET /api/rows?index=dax,nasdaq100&symbols=AAPL,SAP.DE → { rows }
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const split = (v: string | null) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);

  const symbols = new Set<string>();
  for (const id of split(params.get("index"))) getIndex(id)?.constituents?.forEach((s) => symbols.add(s));
  for (const s of split(params.get("symbols"))) symbols.add(s.toUpperCase());

  if (!symbols.size) return Response.json({ rows: [] });
  if (symbols.size > MAX_SYMBOLS) return Response.json({ error: `Maximal ${MAX_SYMBOLS} Werte` }, { status: 400 });
  return Response.json({ rows: await buildRows([...symbols]) });
}
