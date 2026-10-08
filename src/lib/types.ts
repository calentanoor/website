import type { Signal } from "./rating";

export type Candle = {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type Fundamentals = {
  trailingPE?: number;
  forwardPE?: number;
  pegRatio?: number;
  priceToBook?: number;
  evToEbitda?: number;
  dividendYield?: number;
  returnOnEquity?: number;
  operatingMargins?: number;
  profitMargins?: number;
  revenueGrowth?: number;
  earningsGrowth?: number;
  debtToEquity?: number; // in percent, as delivered by Yahoo (150 = 1.5x)
  currentRatio?: number;
  freeCashflow?: number;
  recommendationMean?: number; // 1 = strong buy … 5 = sell
  numberOfAnalystOpinions?: number;
  targetMeanPrice?: number;
};

export type StockEvents = {
  earningsDate?: number; // unix ms
  exDividendDate?: number;
  dividendDate?: number;
};

export type StockData = {
  symbol: string;
  name: string;
  currency: string;
  sector?: string;
  industry?: string;
  price: number;
  changePercent: number;
  marketCap?: number;
  fundamentals: Fundamentals;
  events: StockEvents;
  candles: Candle[];
};

export type IndexQuote = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  currency?: string;
  candles: Candle[];
};

// One row of the screener tables (serialisable, shared by server and client).
export type ScreenerRow = {
  symbol: string;
  name: string;
  sector?: string;
  currency?: string;
  price?: number;
  changePercent?: number;
  perf1m?: number;
  perf6m?: number;
  marketCap?: number;
  forwardPE?: number;
  pegRatio?: number;
  dividendYield?: number;
  returnOnEquity?: number;
  revenueGrowth?: number;
  rsi?: number;
  earningsDate?: number;
  analysts?: number;
  targetPrice?: number;
  targetUpside?: number;
  analystScore?: number;
  recommendation?: string;
  recommendationMean?: number;
  fundamental?: number;
  technical?: number;
  total?: number;
  signals: Signal[];
  error?: string;
};
