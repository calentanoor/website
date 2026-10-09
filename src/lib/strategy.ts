// Trading strategies for the daily "Top 5", the backtest and the test
// portfolio. All rules use price data only (no fundamentals), so they can be
// replayed on history without look-ahead.
//
// Common to all strategies:
// - Market filter: calls only while the stock's home index trades above its
//   200-day average, puts only while it trades below.
// - Entry at the next day's open, initial stop from ATR or the pattern.
// - Trailing stop (3 ATR from the best close since entry) lets winners run;
//   exit at the latest after `maxHoldDays` trading days.
// - Warrants: at-the-money, 6 months; rolled into a new 6-month warrant when
//   less than 3 months remain, so the remaining time never drops below that.
import { detectPatterns, type Direction } from "./patterns";
import { atr, rsi, sma } from "./indicators";
import { realizedVol } from "./options-math";
import { warrantIdea, warrantValue } from "./warrant";
import type { Candle } from "./types";

export const RULES = {
  lookback: 260, // bars of history needed before the first signal
  testYears: 5,
  maxHoldDays: 90, // trading days
  maxPositions: 10,
  picksPerDay: 5,
  trailAtr: 3,
  warrantDays: 182, // new warrants: ~6 months
  minRemainingDays: 91, // roll when fewer calendar days remain
};

export type StrategyId = "momentum" | "breakout" | "pullback";

export const STRATEGIES: Record<StrategyId, { name: string; short: string; description: string }> = {
  momentum: {
    name: "Momentum-Trendfolge",
    short: "Momentum",
    description:
      "Kauft Aktien im intakten Aufwärtstrend (Kurs > SMA 50 > SMA 200, SMA 200 steigend) nahe dem 52-Wochen-Hoch, sobald sie ein neues 20-Tage-Hoch markieren. Rangfolge nach 6-Monats-Stärke. Ausstieg per Trailing-Stop oder Schluss unter der SMA 50. Puts spiegelbildlich nur im Bärenmarkt.",
  },
  breakout: {
    name: "Formations-Ausbruch",
    short: "Formationen",
    description:
      "Frische Ausbrüche aus Chartformationen (≤ 3 Tage, Konfidenz ≥ 50) in Trendrichtung des Gesamtmarkts mit Chance-Risiko ≥ 1,5. Ausstieg am Kursziel der Formation, per Trailing-Stop oder Formations-Stopp.",
  },
  pullback: {
    name: "Rücksetzer im Aufwärtstrend",
    short: "Rücksetzer",
    description:
      "Kauft kurzfristig überverkaufte Aktien (RSI 14 < 35) in einem langfristigen Aufwärtstrend (Kurs > SMA 200, SMA 50 > SMA 200). Ausstieg bei RSI > 65, per Trailing-Stop oder nach Zeitablauf. Nur Calls.",
  },
};

export type Candidate = {
  symbol: string;
  strategy: StrategyId;
  time: number; // signal bar (unix seconds)
  direction: Exclude<Direction, "neutral">;
  score: number;
  pattern: string; // setup label
  price: number;
  stop: number;
  target?: number;
  rewardRisk?: number;
  vol: number;
};

export type ExitReason = "target" | "stop" | "trail" | "signal" | "time" | "open";

export type Trade = Candidate & {
  entryTime: number;
  entryPrice: number;
  exitTime?: number; // undefined while open
  exitPrice: number; // current price while open
  exitReason: ExitReason;
  days: number;
  rolls: number;
  returnPct: number; // underlying, in trade direction
  warrantReturnPct: number;
};

// ---------------------------------------------------------------------------
// Indicator series, computed once per symbol

export type Series = {
  c: Candle[];
  close: number[];
  sma50: number[];
  sma200: number[];
  atr: number[];
  rsi: number[];
  high20: number[]; // highest high of the previous 20 bars
  low20: number[];
  high252: number[];
  low252: number[];
  regime?: (boolean | undefined)[]; // home index above its SMA 200
};

function rolling(values: number[], n: number, fn: (a: number, b: number) => number, offset = 0) {
  return values.map((_, i) => {
    const from = i - n + 1 - offset;
    if (from < 0) return NaN;
    let v = values[from];
    for (let k = from + 1; k <= i - offset; k++) v = fn(v, values[k]);
    return v;
  });
}

const dayKey = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

export function prepare(candles: Candle[], benchmark?: Candle[]): Series {
  const close = candles.map((c) => c.close);
  const high = candles.map((c) => c.high);
  const low = candles.map((c) => c.low);
  let regime: Series["regime"];
  if (benchmark?.length) {
    const bClose = benchmark.map((c) => c.close);
    const bSma = sma(bClose, 200);
    const byDay = new Map(benchmark.map((c, i) => [dayKey(c.time), Number.isFinite(bSma[i]) ? bClose[i] > bSma[i] : undefined]));
    let lastKnown: boolean | undefined;
    regime = candles.map((c) => {
      const v = byDay.get(dayKey(c.time));
      if (v !== undefined) lastKnown = v;
      return lastKnown;
    });
  }
  return {
    c: candles,
    close,
    sma50: sma(close, 50),
    sma200: sma(close, 200),
    atr: atr(high, low, close),
    rsi: rsi(close),
    high20: rolling(high, 20, Math.max, 1),
    low20: rolling(low, 20, Math.min, 1),
    high252: rolling(high, 252, Math.max),
    low252: rolling(low, 252, Math.min),
    regime,
  };
}

const bull = (s: Series, d: number) => s.regime?.[d] !== false; // unknown → allowed
const bear = (s: Series, d: number) => s.regime?.[d] === false;

function vol60(s: Series, d: number) {
  return realizedVol(s.close.slice(Math.max(0, d - 60), d + 1), 60) ?? 0.3;
}

// ---------------------------------------------------------------------------
// Entry signals on bar d

function momentumSignal(symbol: string, s: Series, d: number): Candidate | undefined {
  const price = s.close[d];
  const a = s.atr[d];
  if (!Number.isFinite(s.sma200[d - 20]) || !Number.isFinite(a)) return undefined;
  const strength = s.close[d] / s.close[d - 126] - 1;
  const base = { symbol, strategy: "momentum" as const, time: s.c[d].time, price, vol: vol60(s, d) };

  const up = price > s.sma50[d] && s.sma50[d] > s.sma200[d] && s.sma200[d] > s.sma200[d - 20] && price >= 0.95 * s.high252[d] && price > s.high20[d];
  if (up && bull(s, d) && strength > 0) {
    return { ...base, direction: "bullish", pattern: "Momentum-Ausbruch", score: Math.round(Math.min(100, 50 + strength * 100)), stop: price - 2.5 * a };
  }
  const down = price < s.sma50[d] && s.sma50[d] < s.sma200[d] && s.sma200[d] < s.sma200[d - 20] && price <= 1.05 * s.low252[d] && price < s.low20[d];
  if (down && bear(s, d) && strength < 0) {
    return { ...base, direction: "bearish", pattern: "Momentum-Bruch", score: Math.round(Math.min(100, 50 - strength * 100)), stop: price + 2.5 * a };
  }
  return undefined;
}

function pullbackSignal(symbol: string, s: Series, d: number): Candidate | undefined {
  const price = s.close[d];
  const a = s.atr[d];
  if (!Number.isFinite(s.sma200[d]) || !Number.isFinite(a) || !bull(s, d)) return undefined;
  if (!(price > s.sma200[d] && s.sma50[d] > s.sma200[d] && s.rsi[d] < 35)) return undefined;
  const strength = s.close[d] / s.close[d - 126] - 1;
  return {
    symbol,
    strategy: "pullback",
    time: s.c[d].time,
    direction: "bullish",
    pattern: "Rücksetzer im Aufwärtstrend",
    score: Math.round(Math.max(0, Math.min(100, 40 + strength * 60 + (35 - s.rsi[d])))),
    price,
    stop: price - 3 * a,
    vol: vol60(s, d),
  };
}

function breakoutSignal(symbol: string, s: Series, d: number): Candidate | undefined {
  // Cheap pre-filter: a pattern breakout coincides with a 10-day extreme close
  // within the last 3 bars; only then run the (expensive) pattern detection.
  let extreme = false;
  for (let k = d - 2; k <= d; k++) {
    const prior = s.close.slice(Math.max(0, k - 10), k);
    if (prior.length && (s.close[k] > Math.max(...prior) || s.close[k] < Math.min(...prior))) extreme = true;
  }
  if (!extreme) return undefined;

  const window = s.c.slice(Math.max(0, d - RULES.lookback + 1), d + 1);
  const freshFrom = window[Math.max(0, window.length - 3)].time;
  const price = s.close[d];
  let best: Candidate | undefined;
  for (const p of detectPatterns(window).patterns) {
    if (p.direction === "neutral" || p.status === "forming" || (p.breakoutTime ?? 0) < freshFrom || p.confidence < 50 || p.stop == null) continue;
    const long = p.direction === "bullish";
    if (long ? !bull(s, d) : !bear(s, d)) continue;
    const risk = long ? price - p.stop : p.stop - price;
    if (risk <= 0) continue;
    const target = p.target ?? (long ? price + 2 * risk : price - 2 * risk);
    const rewardRisk = (long ? target - price : price - target) / risk;
    if (rewardRisk < 1.5) continue;
    const score = Math.round(0.6 * p.confidence + 40 * Math.min(1, rewardRisk / 4));
    if (!best || score > best.score) {
      best = { symbol, strategy: "breakout", time: s.c[d].time, direction: p.direction, pattern: p.label, score, price, stop: p.stop, target, rewardRisk, vol: vol60(s, d) };
    }
  }
  return best;
}

export function signalOn(id: StrategyId, symbol: string, s: Series, d: number): Candidate | undefined {
  if (d < RULES.lookback) return undefined;
  return id === "momentum" ? momentumSignal(symbol, s, d) : id === "pullback" ? pullbackSignal(symbol, s, d) : breakoutSignal(symbol, s, d);
}

// ---------------------------------------------------------------------------
// Trade simulation

export function simulate(c: Candidate, s: Series, d: number): Trade | undefined {
  const entryBar = s.c[d + 1];
  if (!entryBar) return undefined;
  const long = c.direction === "bullish";
  const dir = long ? 1 : -1;
  const entryPrice = entryBar.open;

  // Warrant chain: value multiplier across rolls
  let w = warrantIdea(c.direction, entryPrice, c.vol, RULES.warrantDays);
  let wStart = entryBar.time;
  let wMultiplier = 1;
  let rolls = 0;
  const warrantNow = (spot: number, time: number) => warrantValue(w.type, spot, w.strike, RULES.warrantDays - (time - wStart) / 86400, w.vol) / w.fairPrice;

  let stop = c.stop;
  let best = entryPrice;
  let exit: { i: number; price: number; reason: ExitReason } | undefined;

  for (let i = d + 1; i < s.c.length; i++) {
    const bar = s.c[i];
    const held = i - d;
    const hitStop = long ? bar.low <= stop : bar.high >= stop;
    if (hitStop) {
      exit = { i, price: long ? Math.min(bar.open, stop) : Math.max(bar.open, stop), reason: stop === c.stop ? "stop" : "trail" };
      break;
    }
    if (c.target != null && (long ? bar.high >= c.target : bar.low <= c.target)) {
      exit = { i, price: long ? Math.max(bar.open, c.target) : Math.min(bar.open, c.target), reason: "target" };
      break;
    }
    if (c.strategy === "momentum" && (long ? bar.close < s.sma50[i] : bar.close > s.sma50[i])) {
      exit = { i, price: bar.close, reason: "signal" };
      break;
    }
    if (c.strategy === "pullback" && s.rsi[i] > 65) {
      exit = { i, price: bar.close, reason: "signal" };
      break;
    }
    if (held >= RULES.maxHoldDays) {
      exit = { i, price: bar.close, reason: "time" };
      break;
    }
    // trail the stop on closes, never loosen it
    best = long ? Math.max(best, bar.close) : Math.min(best, bar.close);
    const trail = best - dir * RULES.trailAtr * s.atr[i];
    stop = long ? Math.max(stop, trail) : Math.min(stop, trail);

    // roll the warrant before its remaining time drops below 3 months
    if (RULES.warrantDays - (bar.time - wStart) / 86400 < RULES.minRemainingDays) {
      wMultiplier *= warrantNow(bar.close, bar.time);
      w = warrantIdea(c.direction, bar.close, c.vol, RULES.warrantDays);
      wStart = bar.time;
      rolls++;
    }
  }

  const endIndex = exit?.i ?? s.c.length - 1;
  const exitPrice = exit?.price ?? s.c[s.c.length - 1].close;
  const endTime = s.c[endIndex].time;
  return {
    ...c,
    entryTime: entryBar.time,
    entryPrice,
    exitTime: exit ? endTime : undefined,
    exitPrice,
    exitReason: exit?.reason ?? "open",
    days: endIndex - d,
    rolls,
    returnPct: ((dir * (exitPrice - entryPrice)) / entryPrice) * 100,
    warrantReturnPct: (wMultiplier * warrantNow(exitPrice, endTime) - 1) * 100,
  };
}

// All trades of one symbol from bar `from` on. While a trade is running the
// symbol produces no new signal (one position per symbol).
export function replay(id: StrategyId, symbol: string, s: Series, from: number): Trade[] {
  const trades: Trade[] = [];
  for (let d = Math.max(from, RULES.lookback); d < s.c.length; d++) {
    const c = signalOn(id, symbol, s, d);
    if (!c) continue;
    const trade = simulate(c, s, d);
    if (!trade) continue;
    trades.push(trade);
    if (trade.exitReason === "open") break;
    d += trade.days;
  }
  return trades;
}

// ---------------------------------------------------------------------------
// Portfolio

export type PortfolioSettings = {
  startCapital: number;
  positionPct: number; // % of current equity per new position
  costPct: number; // per transaction (buy, sell, each roll counts twice)
  instrument: "stock" | "warrant";
  from?: number;
};

export type PortfolioTrade = Trade & { invested: number; pnl: number };

export type PortfolioResult = {
  trades: PortfolioTrade[];
  equity: { time: number; value: number }[];
  final: number;
  returnPct: number;
  cagrPct?: number;
  maxDrawdownPct: number;
  winRate?: number;
  closed: number;
  open: number;
  yearly: { year: number; returnPct: number }[];
  skipped: number; // signals not taken because all slots were in use
};

// Every day the best signals (by score) fill free slots – at most
// `maxPositions` at a time, `picksPerDay` new ones per day – sized as a share
// of current equity; a symbol is never held twice.
export function runPortfolio(all: Trade[], s: PortfolioSettings): PortfolioResult {
  const byDay = new Map<number, Trade[]>();
  for (const t of all) {
    if (s.from != null && t.time < s.from) continue;
    byDay.set(t.entryTime, [...(byDay.get(t.entryTime) ?? []), t]);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const latest = Math.max(0, ...all.map((t) => t.exitTime ?? t.entryTime + t.days * 1.45 * 86400));
  const ret = (t: Trade) => {
    const gross = (s.instrument === "warrant" ? t.warrantReturnPct : t.returnPct) / 100;
    const transactions = 2 + (s.instrument === "warrant" ? 2 * t.rolls : 0);
    return Math.max(-1, (1 + gross) * (1 - s.costPct / 100) ** transactions - 1);
  };

  let cash = s.startCapital;
  let skipped = 0;
  const held: PortfolioTrade[] = [];
  const done: PortfolioTrade[] = [];
  const settle = (until: number) => {
    for (let k = held.length - 1; k >= 0; k--) {
      const h = held[k];
      if (h.exitTime != null && h.exitTime < until) {
        cash += h.invested + h.pnl;
        done.push(h);
        held.splice(k, 1);
      }
    }
  };

  for (const day of days) {
    settle(day);
    const equityBook = cash + held.reduce((a, h) => a + h.invested, 0);
    const picks = byDay
      .get(day)!
      .filter((t) => !held.some((h) => h.symbol === t.symbol))
      .sort((a, b) => b.score - a.score);
    let taken = 0;
    for (const t of picks) {
      const size = (equityBook * s.positionPct) / 100;
      if (held.length >= RULES.maxPositions || taken >= RULES.picksPerDay || cash < size || size <= 0) {
        skipped++;
        continue;
      }
      cash -= size;
      held.push({ ...t, invested: size, pnl: size * ret(t) });
      taken++;
    }
  }
  const trades = [...done, ...held].sort((a, b) => a.entryTime - b.entryTime);

  // Equity curve of realised results (open positions valued at the latest bar)
  const events = trades.map((t) => ({ time: t.exitTime ?? latest, delta: t.pnl })).sort((a, b) => a.time - b.time);
  const start = (s.from ?? trades[0]?.entryTime ?? latest) - 86400;
  let value = s.startCapital;
  let peak = value;
  let maxDd = 0;
  const equity = [{ time: start, value }];
  for (const e of events) {
    value += e.delta;
    peak = Math.max(peak, value);
    maxDd = Math.max(maxDd, (peak - value) / peak);
    if (equity[equity.length - 1].time === e.time) equity[equity.length - 1].value = value;
    else equity.push({ time: e.time, value });
  }

  const yearly: PortfolioResult["yearly"] = [];
  let yearStartValue = s.startCapital;
  for (let y = new Date(start * 1000).getUTCFullYear(); y <= new Date(latest * 1000).getUTCFullYear(); y++) {
    const endOfYear = Date.UTC(y + 1, 0, 1) / 1000;
    const lastPoint = [...equity].reverse().find((p) => p.time < endOfYear);
    const v = lastPoint?.value ?? yearStartValue;
    yearly.push({ year: y, returnPct: (v / yearStartValue - 1) * 100 });
    yearStartValue = v;
  }

  const years = (latest - start) / (365.25 * 86400);
  const closed = trades.filter((t) => t.exitReason !== "open");
  return {
    trades,
    equity,
    final: value,
    returnPct: (value / s.startCapital - 1) * 100,
    cagrPct: years > 0.5 && value > 0 ? ((value / s.startCapital) ** (1 / years) - 1) * 100 : undefined,
    maxDrawdownPct: maxDd * 100,
    winRate: closed.length ? (closed.filter((t) => t.pnl > 0).length / closed.length) * 100 : undefined,
    closed: closed.length,
    open: trades.length - closed.length,
    yearly,
    skipped,
  };
}

export type SetupStat = { pattern: string; direction: string; count: number; winRate: number; avgReturn: number; avgWarrant: number; avgDays: number; targetRate: number; stopRate: number };

export function setupStats(trades: Trade[]): SetupStat[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades.filter((t) => t.exitReason !== "open")) {
    const key = `${t.pattern}|${t.direction}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const [pattern, direction] = key.split("|");
      const n = list.length;
      const avg = (f: (t: Trade) => number) => list.reduce((a, t) => a + f(t), 0) / n;
      return {
        pattern,
        direction,
        count: n,
        winRate: (list.filter((t) => t.returnPct > 0).length / n) * 100,
        avgReturn: avg((t) => t.returnPct),
        avgWarrant: avg((t) => Math.max(-100, t.warrantReturnPct)),
        avgDays: avg((t) => t.days),
        targetRate: (list.filter((t) => t.exitReason === "target").length / n) * 100,
        stopRate: (list.filter((t) => t.exitReason === "stop" || t.exitReason === "trail").length / n) * 100,
      };
    })
    .sort((a, b) => b.count - a.count);
}
