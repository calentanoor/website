import type { NextRequest } from "next/server";
import { getIndex } from "@/lib/indices";
import { getIndexTrades } from "@/lib/strategy-data";

// Replaying a whole index can take a while on the first (uncached) call.
export const maxDuration = 300;

// GET /api/strategy?index=dax → { trades, info, errors }
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("index") ?? "";
  if (!getIndex(id)?.constituents) return Response.json({ error: "Unbekannter Index" }, { status: 400 });
  return Response.json(await getIndexTrades(id));
}
