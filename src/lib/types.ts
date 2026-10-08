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
