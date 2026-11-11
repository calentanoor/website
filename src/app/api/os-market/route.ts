import type { NextRequest } from "next/server";
import { getEurUsd, getStockSafe } from "@/lib/market-data";

// GET /api/os-market?symbols=NVDA,AVGO → share prices, earnings dates and EUR/USD
export async function GET(request: NextRequest) {
  const symbols = (request.nextUrl.searchParams.get("symbols") ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 50);
  const [eurusd, stocks] = await Promise.all([getEurUsd().catch(() => undefined), Promise.all(symbols.map(getStockSafe))]);
  const quotes = Object.fromEntries(
    stocks.map((s) =>
      "error" in s
        ? [s.symbol, { error: s.error }]
        : [s.symbol, { price: s.price, changePercent: s.changePercent, currency: s.currency, name: s.name, sector: s.sector, earningsDate: s.events.earningsDate }],
    ),
  );
  return Response.json({ eurusd, quotes, asOf: new Date().toISOString() });
}
