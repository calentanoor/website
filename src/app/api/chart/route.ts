import type { NextRequest } from "next/server";
import { CHART_RANGES, getChart, type ChartRange } from "@/lib/market-data";

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.toUpperCase();
  const range = request.nextUrl.searchParams.get("range") as ChartRange | null;
  if (!symbol || !range || !CHART_RANGES.includes(range)) {
    return Response.json({ error: "symbol und range (1d, 1mo, 1y, 5y) erforderlich" }, { status: 400 });
  }
  try {
    return Response.json({ candles: await getChart(symbol, range) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
