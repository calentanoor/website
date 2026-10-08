// Deterministic synthetic data for offline development (MOCK_DATA=1).
import type { Candle, IndexQuote, StockData } from "./types";

function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function mockCandles(seed: string, start: number, bars = 400): Candle[] {
  const rnd = seededRandom(seed);
  const drift = (rnd() - 0.45) * 0.002;
  const vol = 0.01 + rnd() * 0.02;
  const candles: Candle[] = [];
  let close = start;
  const day = 86400;
  let time = Math.floor(Date.UTC(2026, 9, 7) / 1000) - bars * day * 1.4;
  for (let i = 0; i < bars; i++) {
    time += day * (i % 5 === 4 ? 3 : 1);
    const open = close;
    close = Math.max(1, open * (1 + drift + (rnd() - 0.5) * 2 * vol));
    const high = Math.max(open, close) * (1 + rnd() * vol);
    const low = Math.min(open, close) * (1 - rnd() * vol);
    candles.push({ time: Math.floor(time), open, high, low, close, volume: Math.floor(1e6 * (0.5 + rnd())) });
  }
  return candles;
}

export function mockIndexQuote(symbol: string): IndexQuote {
  const candles = mockCandles(symbol, symbol === "^VIX" ? 18 : 10000);
  const [prev, cur] = candles.slice(-2);
  return {
    symbol,
    price: cur.close,
    change: cur.close - prev.close,
    changePercent: (cur.close / prev.close - 1) * 100,
    currency: "EUR",
    candles,
  };
}

export function mockStock(symbol: string): StockData {
  const rnd = seededRandom(symbol + "f");
  const candles = mockCandles(symbol, 20 + rnd() * 400);
  const [prev, cur] = candles.slice(-2);
  const now = Date.UTC(2026, 9, 8);
  return {
    symbol,
    name: `${symbol.split(".")[0]} Demo AG`,
    currency: symbol.includes(".") ? "EUR" : "USD",
    sector: ["Technology", "Industrials", "Financial Services", "Healthcare", "Consumer Cyclical"][Math.floor(rnd() * 5)],
    industry: "Demo",
    price: cur.close,
    changePercent: (cur.close / prev.close - 1) * 100,
    marketCap: Math.floor(rnd() * 3e11),
    fundamentals: {
      trailingPE: 8 + rnd() * 40,
      forwardPE: 7 + rnd() * 35,
      pegRatio: 0.5 + rnd() * 3,
      priceToBook: 0.8 + rnd() * 10,
      evToEbitda: 5 + rnd() * 25,
      dividendYield: rnd() * 0.05,
      returnOnEquity: -0.05 + rnd() * 0.4,
      operatingMargins: -0.05 + rnd() * 0.4,
      profitMargins: -0.05 + rnd() * 0.3,
      revenueGrowth: -0.1 + rnd() * 0.35,
      earningsGrowth: -0.2 + rnd() * 0.5,
      debtToEquity: rnd() * 250,
      currentRatio: 0.6 + rnd() * 2,
      freeCashflow: (rnd() - 0.2) * 1e10,
      recommendationMean: 1.3 + rnd() * 2.5,
      numberOfAnalystOpinions: Math.floor(5 + rnd() * 30),
      targetMeanPrice: cur.close * (0.85 + rnd() * 0.45),
    },
    events: {
      earningsDate: now + Math.floor(rnd() * 60) * 86400000,
      exDividendDate: now + Math.floor((rnd() - 0.5) * 200) * 86400000,
    },
    candles,
  };
}
