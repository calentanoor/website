import type { NextRequest } from "next/server";
import { getIndex } from "@/lib/indices";
import { getBenchmarks, getIndexTrades, isStrategy } from "@/lib/strategy-data";

// Replaying five years of an index can take a while on the first call.
export const maxDuration = 300;

// GET /api/strategy?index=dax&strategy=momentum → { trades, info, errors }
// GET /api/strategy?benchmarks=1 → { benchmarks }
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("benchmarks")) return Response.json({ benchmarks: await getBenchmarks() });
  const id = params.get("index") ?? "";
  const strategy = params.get("strategy");
  if (!getIndex(id)?.constituents || !isStrategy(strategy)) return Response.json({ error: "index und strategy erforderlich" }, { status: 400 });
  return Response.json(await getIndexTrades(id, strategy));
}
