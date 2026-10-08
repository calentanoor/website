import "server-only";
import YahooFinance from "yahoo-finance2";
import { cacheLife } from "next/cache";
import { mockIndexQuote, mockStock } from "./mock";
import type { Candle, IndexQuote, StockData } from "./types";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
  queue: { concurrency: 4 },
});

const mockEnabled = () => process.env.MOCK_DATA === "1";

const DAY = 24 * 60 * 60 * 1000;

async function getCandles(symbol: string, days: number): Promise<Candle[]> {
  const chart = await yahooFinance.chart(symbol, {
    period1: new Date(Date.now() - days * DAY),
    interval: "1d",
    return: "array",
  });
  return chart.quotes
    .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
    .map((q) => ({
      time: Math.floor(q.date.getTime() / 1000),
      open: q.open!,
      high: q.high!,
      low: q.low!,
      close: q.close!,
      volume: q.volume ?? 0,
    }));
}

export async function getIndexQuote(symbol: string): Promise<IndexQuote> {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  if (mockEnabled()) return mockIndexQuote(symbol);

  const [quote, candles] = await Promise.all([
    yahooFinance.quote(symbol),
    getCandles(symbol, 400),
  ]);
  return {
    symbol,
    price: quote.regularMarketPrice ?? candles.at(-1)?.close ?? NaN,
    change: quote.regularMarketChange ?? 0,
    changePercent: quote.regularMarketChangePercent ?? 0,
    currency: quote.currency,
    candles,
  };
}

const toMs = (d?: Date) => (d ? d.getTime() : undefined);

export async function getStock(symbol: string): Promise<StockData> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 1800, expire: 86400 });
  if (mockEnabled()) return mockStock(symbol);

  const [summary, candles] = await Promise.all([
    yahooFinance.quoteSummary(symbol, {
      modules: [
        "price",
        "summaryDetail",
        "defaultKeyStatistics",
        "financialData",
        "assetProfile",
        "calendarEvents",
      ],
    }),
    getCandles(symbol, 560),
  ]);
  const { price, summaryDetail: sd, defaultKeyStatistics: ks, financialData: fd, assetProfile: ap, calendarEvents: ce } = summary;

  return {
    symbol,
    name: price?.longName ?? price?.shortName ?? symbol,
    currency: price?.currency ?? "",
    sector: ap?.sector ?? undefined,
    industry: ap?.industry ?? undefined,
    price: price?.regularMarketPrice ?? candles.at(-1)?.close ?? NaN,
    changePercent: (price?.regularMarketChangePercent ?? 0) * 100,
    marketCap: price?.marketCap ?? sd?.marketCap,
    fundamentals: {
      trailingPE: sd?.trailingPE,
      forwardPE: sd?.forwardPE ?? ks?.forwardPE,
      pegRatio: ks?.pegRatio,
      priceToBook: ks?.priceToBook,
      evToEbitda: ks?.enterpriseToEbitda,
      dividendYield: sd?.dividendYield,
      returnOnEquity: fd?.returnOnEquity,
      operatingMargins: fd?.operatingMargins,
      profitMargins: fd?.profitMargins,
      revenueGrowth: fd?.revenueGrowth,
      earningsGrowth: fd?.earningsGrowth,
      debtToEquity: fd?.debtToEquity,
      currentRatio: fd?.currentRatio,
      freeCashflow: fd?.freeCashflow,
      recommendationMean: fd?.recommendationMean,
      numberOfAnalystOpinions: fd?.numberOfAnalystOpinions,
      targetMeanPrice: fd?.targetMeanPrice,
    },
    events: {
      earningsDate: toMs(ce?.earnings?.earningsDate?.[0]),
      exDividendDate: toMs(ce?.exDividendDate),
      dividendDate: toMs(ce?.dividendDate),
    },
    candles,
  };
}

// Never throws: failed symbols resolve to an error entry instead.
export async function getStockSafe(symbol: string): Promise<StockData | { symbol: string; error: string }> {
  try {
    return await getStock(symbol);
  } catch (e) {
    return { symbol, error: e instanceof Error ? e.message : String(e) };
  }
}
