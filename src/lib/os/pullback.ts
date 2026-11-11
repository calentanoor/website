// "Quality in a pullback": fundamentally strong companies that have come back
// from their high while the long-term trend is still intact (pure functions).
import { rsi, sma } from "../indicators";
import type { Candle } from "../types";

export const PULLBACK_RULES = {
  minMarketCapEur: 20e9,
  minFundamental: 65,
  minDrawdown: 0.05, // at least 5 % below the 52-week high …
  maxDrawdown: 0.4, // … but not more than 40 % (broken stories)
  maxBelowSma200: 0.1, // or SMA 200 still rising
  weights: { fundamental: 0.45, pullback: 0.25, upside: 0.15, stabilisation: 0.15 },
};

export type PullbackMetrics = {
  drawdown: number; // fraction below the 52-week high (0.18 = −18 %)
  vsSma200?: number; // price / SMA 200 − 1
  sma200Rising?: boolean; // vs. 20 trading days ago
  ret5d?: number; // last 5 trading days
  rsi?: number;
  rsiRising?: boolean; // vs. 5 days ago
};

export function pullbackMetrics(candles: Candle[]): PullbackMetrics | undefined {
  if (candles.length < 60) return undefined;
  const close = candles.map((c) => c.close);
  const n = close.length;
  const price = close[n - 1];
  const high252 = Math.max(...candles.slice(-252).map((c) => c.high));
  const s200 = sma(close, 200);
  const r = rsi(close);
  const last = (a: number[], back = 0) => (Number.isFinite(a[n - 1 - back]) ? a[n - 1 - back] : undefined);
  const sNow = last(s200);
  const sPrev = last(s200, 20);
  const rNow = last(r);
  const rPrev = last(r, 5);
  return {
    drawdown: 1 - price / high252,
    vsSma200: sNow ? price / sNow - 1 : undefined,
    sma200Rising: sNow != null && sPrev != null ? sNow >= sPrev : undefined,
    ret5d: n > 6 ? price / close[n - 6] - 1 : undefined,
    rsi: rNow,
    rsiRising: rNow != null && rPrev != null ? rNow > rPrev : undefined,
  };
}

// Long-term trend still intact: SMA 200 rising, or price at most 10 % below it
export function trendIntact(m: PullbackMetrics) {
  return m.sma200Rising === true || (m.vsSma200 != null && m.vsSma200 >= -PULLBACK_RULES.maxBelowSma200);
}

// 0–100: best for 15–25 % below the high, rising from 5 %, falling towards 40 %
export function drawdownScore(dd: number) {
  if (dd < PULLBACK_RULES.minDrawdown || dd > PULLBACK_RULES.maxDrawdown) return 0;
  if (dd < 0.15) return ((dd - 0.05) / 0.1) * 100;
  if (dd <= 0.25) return 100;
  return ((0.4 - dd) / 0.15) * 100;
}

// 0–100: price stabilising (last 5 days up, RSI turning up from low levels)
export function stabilisationScore(m: PullbackMetrics) {
  let s = 0;
  if (m.ret5d != null) s += m.ret5d > 0 ? 50 : Math.max(0, 50 + m.ret5d * 500); // −10 % → 0
  if (m.rsiRising) s += 30;
  if (m.rsi != null && m.rsi >= 30 && m.rsi <= 55) s += 20;
  return Math.min(100, s);
}

// Analysts' upside to the mean target: 0 % → 0, 30 % or more → 100
export const upsideScore = (upsidePct?: number) => (upsidePct == null ? 50 : Math.max(0, Math.min(100, (upsidePct / 30) * 100)));

export function qualifiesForPullback(m: PullbackMetrics, fundamental: number, marketCapEur?: number) {
  const r = PULLBACK_RULES;
  return (
    marketCapEur != null &&
    marketCapEur >= r.minMarketCapEur &&
    fundamental >= r.minFundamental &&
    m.drawdown >= r.minDrawdown &&
    m.drawdown <= r.maxDrawdown &&
    trendIntact(m)
  );
}

export function pullbackScore(m: PullbackMetrics, fundamental: number, upsidePct?: number) {
  const w = PULLBACK_RULES.weights;
  return w.fundamental * fundamental + w.pullback * drawdownScore(m.drawdown) + w.upside * upsideScore(upsidePct) + w.stabilisation * stabilisationScore(m);
}
