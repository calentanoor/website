// Scoring model: every criterion maps a raw value linearly onto 0–100 between a
// "bad" and a "good" threshold. Category scores are the mean of the available
// criteria; missing data is skipped rather than counted as zero.
import { atr, bollingerWidth, last, macd, roc, rsi, sma } from "./indicators";
import { formatNumber } from "./format";
import type { Candle, Fundamentals } from "./types";

export type Criterion = {
  label: string;
  value?: number;
  display: string;
  score?: number;
};

export type Category = {
  key: string;
  label: string;
  score?: number;
  criteria: Criterion[];
};

export type Signal = {
  label: string;
  short: string;
  tone: "bullish" | "bearish" | "neutral";
};

export type Rating = {
  fundamental?: number;
  technical?: number;
  total?: number;
  fundamentalCategories: Category[];
  technicalCategories: Category[];
  signals: Signal[];
};

export function scale(value: number | undefined, bad: number, good: number): number | undefined {
  if (value == null || !Number.isFinite(value)) return undefined;
  const t = (value - bad) / (good - bad);
  return Math.round(Math.min(1, Math.max(0, t)) * 100);
}

function mean(values: (number | undefined)[]): number | undefined {
  const v = values.filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : undefined;
}

function category(key: string, label: string, criteria: Criterion[]): Category {
  return { key, label, criteria, score: mean(criteria.map((c) => c.score)) };
}

const pct = (v?: number, digits = 1) => (v == null ? "–" : `${formatNumber(v * 100, digits)} %`);
const num = (v?: number, digits = 1) => formatNumber(v, digits);

// Negative multiples (losses) are rated as worst case instead of "cheap".
const multiple = (v: number | undefined, bad: number, good: number) =>
  v == null ? undefined : v <= 0 ? 0 : scale(v, bad, good);

export function rateFundamentals(f: Fundamentals, price: number, sector?: string): Category[] {
  const isFinancial = sector === "Financial Services";
  const upside = f.targetMeanPrice && price ? f.targetMeanPrice / price - 1 : undefined;

  return [
    category("valuation", "Bewertung", [
      { label: "KGV (erwartet)", value: f.forwardPE, display: num(f.forwardPE), score: multiple(f.forwardPE, 40, 10) },
      { label: "PEG-Ratio", value: f.pegRatio, display: num(f.pegRatio, 2), score: multiple(f.pegRatio, 3, 1) },
      ...(isFinancial
        ? [{ label: "KBV", value: f.priceToBook, display: num(f.priceToBook, 2), score: multiple(f.priceToBook, 3, 0.8) }]
        : [{ label: "EV/EBITDA", value: f.evToEbitda, display: num(f.evToEbitda), score: multiple(f.evToEbitda, 25, 8) }]),
    ]),
    category("quality", "Qualität", [
      { label: "Eigenkapitalrendite", value: f.returnOnEquity, display: pct(f.returnOnEquity), score: scale(f.returnOnEquity, 0, 0.25) },
      { label: "Operative Marge", value: f.operatingMargins, display: pct(f.operatingMargins), score: isFinancial ? undefined : scale(f.operatingMargins, 0, 0.3) },
      { label: "Nettomarge", value: f.profitMargins, display: pct(f.profitMargins), score: scale(f.profitMargins, 0, 0.2) },
    ]),
    category("growth", "Wachstum", [
      { label: "Umsatzwachstum", value: f.revenueGrowth, display: pct(f.revenueGrowth), score: scale(f.revenueGrowth, -0.05, 0.2) },
      { label: "Gewinnwachstum", value: f.earningsGrowth, display: pct(f.earningsGrowth), score: scale(f.earningsGrowth, -0.1, 0.25) },
    ]),
    category("balance", "Finanzkraft", isFinancial
      ? []
      : [
          { label: "Verschuldung (D/E)", value: f.debtToEquity, display: f.debtToEquity == null ? "–" : `${formatNumber(f.debtToEquity / 100)}x`, score: scale(f.debtToEquity, 200, 30) },
          { label: "Current Ratio", value: f.currentRatio, display: num(f.currentRatio, 2), score: scale(f.currentRatio, 0.8, 2) },
          { label: "Free Cashflow", value: f.freeCashflow, display: f.freeCashflow == null ? "–" : f.freeCashflow > 0 ? "positiv" : "negativ", score: f.freeCashflow == null ? undefined : f.freeCashflow > 0 ? 100 : 0 },
        ]),
    category("analysts", "Analysten", [
      { label: "Konsens (1 = Kaufen, 5 = Verkaufen)", value: f.recommendationMean, display: num(f.recommendationMean), score: analystScore(f.recommendationMean) },
      { label: "Kursziel-Potenzial", value: upside, display: pct(upside), score: scale(upside, -0.1, 0.25) },
    ]),
  ];
}

export function rateTechnicals(candles: Candle[]): { categories: Category[]; signals: Signal[] } {
  const signals: Signal[] = [];
  if (candles.length < 60) return { categories: [], signals };

  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  const price = last(close);

  const sma50 = sma(close, 50);
  const sma200 = sma(close, 200);
  const s50 = last(sma50);
  const s200 = last(sma200);
  const s200Prev = sma200[sma200.length - 21];
  const rsi14 = last(rsi(close));
  const m = macd(close);
  const hist = last(m.histogram);
  const histPrev = m.histogram[m.histogram.length - 2];
  const perf3m = roc(close, 63);
  const perf6m = roc(close, 126);
  const year = candles.slice(-252);
  const high52 = Math.max(...year.map((c) => c.high));
  const low52 = Math.min(...year.map((c) => c.low));
  const pos52 = (price - low52) / (high52 - low52);
  const atrPct = last(atr(high, low, close)) / price;

  const distTo = (ref: number) => (Number.isFinite(ref) ? price / ref - 1 : undefined);

  const categories = [
    category("trend", "Trend", [
      { label: "Kurs vs. SMA 50", value: distTo(s50), display: pct(distTo(s50)), score: scale(distTo(s50), -0.08, 0.08) },
      { label: "Kurs vs. SMA 200", value: distTo(s200), display: pct(distTo(s200)), score: scale(distTo(s200), -0.15, 0.15) },
      { label: "SMA 50 vs. SMA 200", value: Number.isFinite(s200) ? s50 / s200 - 1 : undefined, display: Number.isFinite(s200) ? (s50 > s200 ? "darüber" : "darunter") : "–", score: Number.isFinite(s200) ? (s50 > s200 ? 100 : 0) : undefined },
      { label: "Steigung SMA 200 (1 Monat)", value: s200 / s200Prev - 1, display: pct(s200 / s200Prev - 1, 2), score: scale(s200 / s200Prev - 1, -0.02, 0.02) },
    ]),
    category("momentum", "Momentum", [
      // Best around 55–65; overbought and oversold readings both cost points.
      { label: "RSI (14)", value: rsi14, display: num(rsi14), score: rsi14 == null || Number.isNaN(rsi14) ? undefined : Math.round(Math.max(0, 100 - Math.abs(rsi14 - 60) * 3.3)) },
      { label: "MACD-Histogramm", value: hist, display: hist > 0 ? "positiv" : "negativ", score: Number.isNaN(hist) ? undefined : hist > 0 ? (hist > histPrev ? 100 : 70) : hist > histPrev ? 30 : 0 },
      { label: "Performance 3 Monate", value: perf3m, display: pct(perf3m), score: scale(perf3m, -0.15, 0.15) },
      { label: "Performance 6 Monate", value: perf6m, display: pct(perf6m), score: scale(perf6m, -0.2, 0.25) },
    ]),
    category("range", "Kursposition", [
      { label: "Position in 52-Wochen-Spanne", value: pos52, display: pct(pos52, 0), score: scale(pos52, 0.1, 0.9) },
      { label: "Volatilität (ATR 14)", value: atrPct, display: pct(atrPct, 2), score: scale(atrPct, 0.05, 0.01) },
    ]),
  ];

  // Signals – first building blocks for later pattern detection.
  const crossIndex = (() => {
    for (let i = sma50.length - 1; i > sma50.length - 21 && i > 0; i--) {
      const above = sma50[i] > sma200[i];
      const abovePrev = sma50[i - 1] > sma200[i - 1];
      if (Number.isFinite(sma200[i - 1]) && above !== abovePrev) return { i, above };
    }
    return undefined;
  })();
  if (crossIndex) {
    const ago = sma50.length - 1 - crossIndex.i;
    signals.push(
      crossIndex.above
        ? { label: `Golden Cross (SMA 50/200) vor ${ago} Tagen`, short: `Golden Cross ${ago}T`, tone: "bullish" }
        : { label: `Death Cross (SMA 50/200) vor ${ago} Tagen`, short: `Death Cross ${ago}T`, tone: "bearish" },
    );
  }
  if (rsi14 > 70) signals.push({ label: `RSI überkauft (${rsi14.toFixed(0)})`, short: "RSI überkauft", tone: "bearish" });
  if (rsi14 < 30) signals.push({ label: `RSI überverkauft (${rsi14.toFixed(0)})`, short: "RSI überverkauft", tone: "bullish" });
  if (hist > 0 && histPrev <= 0) signals.push({ label: "MACD kreuzt Signallinie nach oben", short: "MACD ↑", tone: "bullish" });
  if (hist < 0 && histPrev >= 0) signals.push({ label: "MACD kreuzt Signallinie nach unten", short: "MACD ↓", tone: "bearish" });
  if (price >= high52 * 0.98) signals.push({ label: "Nahe 52-Wochen-Hoch", short: "52W-Hoch", tone: "bullish" });
  if (price <= low52 * 1.02) signals.push({ label: "Nahe 52-Wochen-Tief", short: "52W-Tief", tone: "bearish" });

  const prior20High = Math.max(...high.slice(-21, -1));
  const prior20Low = Math.min(...low.slice(-21, -1));
  if (price > prior20High) signals.push({ label: "Ausbruch über 20-Tage-Hoch", short: "Ausbruch 20T", tone: "bullish" });
  if (price < prior20Low) signals.push({ label: "Bruch unter 20-Tage-Tief", short: "Bruch 20T-Tief", tone: "bearish" });

  const bw = bollingerWidth(close).slice(-126).filter((v) => !Number.isNaN(v));
  if (bw.length > 60) {
    const sorted = [...bw].sort((a, b) => a - b);
    if (last(bw) <= sorted[Math.floor(sorted.length * 0.1)])
      signals.push({ label: "Bollinger-Squeeze (Volatilität eng – Ausbruch möglich)", short: "Squeeze", tone: "neutral" });
  }
  if (Number.isFinite(s50) && Math.abs(price / s50 - 1) < 0.01 && price > s200)
    signals.push({ label: "Test der SMA 50 im Aufwärtstrend", short: "SMA-50-Test", tone: "neutral" });

  return { categories, signals };
}

export function rate(f: Fundamentals, candles: Candle[], price: number, sector?: string): Rating {
  const fundamentalCategories = rateFundamentals(f, price, sector);
  const { categories: technicalCategories, signals } = rateTechnicals(candles);
  const fundamental = mean(fundamentalCategories.map((c) => c.score));
  const technical = mean(technicalCategories.map((c) => c.score));
  return {
    fundamental,
    technical,
    total: mean([fundamental, technical]),
    fundamentalCategories,
    technicalCategories,
    signals,
  };
}

export function recommendationLabel(mean: number | undefined): string | undefined {
  if (mean == null) return undefined;
  if (mean <= 1.5) return "Stark kaufen";
  if (mean <= 2.5) return "Kaufen";
  if (mean <= 3.5) return "Halten";
  if (mean <= 4.5) return "Verkaufen";
  return "Stark verkaufen";
}

// Same thresholds as the "Konsens" criterion of the fundamental rating.
export const analystScore = (mean: number | undefined) => scale(mean, 4, 1.5);
