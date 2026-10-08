import "server-only";
import { getStockSafe } from "./market-data";
import { analystScore, rate, recommendationLabel } from "./rating";
import { last, roc, rsi } from "./indicators";
import type { ScreenerRow } from "./types";

const pct = (v: number | undefined) => (v == null || !Number.isFinite(v) ? undefined : v * 100);

export async function buildRows(symbols: string[]): Promise<ScreenerRow[]> {
  const results = await Promise.all(symbols.map(getStockSafe));
  return results.map((s) => {
    if ("error" in s) return { symbol: s.symbol, name: s.symbol, error: s.error, signals: [] };
    const f = s.fundamentals;
    const r = rate(f, s.candles, s.price, s.sector);
    const closes = s.candles.map((c) => c.close);
    return {
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      currency: s.currency,
      price: s.price,
      changePercent: s.changePercent,
      perf1m: pct(roc(closes, 21)),
      perf6m: pct(roc(closes, 126)),
      marketCap: s.marketCap,
      forwardPE: f.forwardPE,
      pegRatio: f.pegRatio,
      dividendYield: pct(f.dividendYield),
      returnOnEquity: pct(f.returnOnEquity),
      revenueGrowth: pct(f.revenueGrowth),
      rsi: closes.length > 15 ? last(rsi(closes)) : undefined,
      earningsDate: s.events.earningsDate,
      analysts: f.numberOfAnalystOpinions,
      targetPrice: f.targetMeanPrice,
      targetUpside: f.targetMeanPrice ? (f.targetMeanPrice / s.price - 1) * 100 : undefined,
      analystScore: analystScore(f.recommendationMean),
      recommendation: recommendationLabel(f.recommendationMean),
      recommendationMean: f.recommendationMean,
      fundamental: r.fundamental,
      technical: r.technical,
      total: r.total,
      signals: r.signals,
    };
  });
}
