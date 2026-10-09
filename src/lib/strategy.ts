// "Top 5" strategy: daily entry signals from fresh pattern breakouts that the
// technical rating confirms. Pure functions on price data only (no
// fundamentals), so the same rules can be replayed on history without
// look-ahead – the backtest and the test portfolio use exactly these rules.
import { detectPatterns, type Direction } from "./patterns";
import { rateTechnicals } from "./rating";
import { realizedVol } from "./options-math";
import { warrantValue, warrantIdea } from "./warrant";
import type { Candle } from "./types";

export const RULES = {
  lookback: 260, // bars of history the detectors see
  freshBars: 3, // breakout at most this many bars old
  minTechLong: 55,
  maxTechShort: 45,
  minConfidence: 50,
  minRewardRisk: 1.5,
  maxHoldDays: 20, // trading days
  warrantDays: 90,
  picksPerDay: 5,
};

export type Candidate = {
  symbol: string;
  time: number; // signal bar (unix seconds)
  direction: Exclude<Direction, "neutral">;
  score: number;
  pattern: string;
  confidence: number;
  technical: number;
  price: number;
  target: number;
  stop: number;
  rewardRisk: number;
  vol: number;
};

export type Trade = Candidate & {
  entryTime: number;
  entryPrice: number;
  exitTime?: number; // undefined while open
  exitPrice: number; // current price while open
  exitReason: "target" | "stop" | "time" | "open";
  days: number;
  returnPct: number; // underlying, in trade direction
  warrantReturnPct: number; // ATM call/put, 3 months, repriced with entry vol
};

function meanScore(categories: { score?: number }[]) {
  const s = categories.map((c) => c.score).filter((v): v is number => v != null);
  return s.length ? s.reduce((a, b) => a + b, 0) / s.length : undefined;
}

// Entry signal on the last bar of `candles`, if any.
export function signalAt(symbol: string, candles: Candle[]): Candidate | undefined {
  const window = candles.slice(-RULES.lookback);
  if (window.length < 120) return undefined;
  const last = window[window.length - 1];
  const freshFrom = window[Math.max(0, window.length - RULES.freshBars)].time;

  const { patterns } = detectPatterns(window);
  const fresh = patterns.filter(
    (p) => p.direction !== "neutral" && p.status !== "forming" && (p.breakoutTime ?? 0) >= freshFrom && p.confidence >= RULES.minConfidence && p.stop != null,
  );
  if (!fresh.length) return undefined;

  const technical = meanScore(rateTechnicals(window).categories);
  if (technical == null) return undefined;

  let best: Candidate | undefined;
  for (const p of fresh) {
    const long = p.direction === "bullish";
    if (long ? technical < RULES.minTechLong : technical > RULES.maxTechShort) continue;
    const price = last.close;
    const stop = p.stop!;
    const risk = long ? price - stop : stop - price;
    if (risk <= 0) continue;
    // Patterns without a measured target use a 2:1 target.
    const target = p.target ?? (long ? price + 2 * risk : price - 2 * risk);
    const reward = long ? target - price : price - target;
    const rewardRisk = reward / risk;
    if (rewardRisk < RULES.minRewardRisk) continue;
    const score = Math.round(0.45 * p.confidence + 0.4 * (long ? technical : 100 - technical) + 15 * Math.min(1, rewardRisk / 4));
    if (!best || score > best.score) {
      best = {
        symbol,
        time: last.time,
        direction: p.direction as Candidate["direction"],
        score,
        pattern: p.label,
        confidence: p.confidence,
        technical: Math.round(technical),
        price,
        target,
        stop,
        rewardRisk,
        vol: realizedVol(window.map((c) => c.close), 60) ?? 0.3,
      };
    }
  }
  return best;
}

// Replay the trade: entry at the next open, exit at stop/target (intraday,
// stop first if both are touched on the same day) or after maxHoldDays.
export function simulate(c: Candidate, candles: Candle[], signalIndex: number): Trade | undefined {
  const entryBar = candles[signalIndex + 1];
  if (!entryBar) return undefined;
  const long = c.direction === "bullish";
  const entryPrice = entryBar.open;
  const dir = long ? 1 : -1;
  const w = warrantIdea(c.direction, entryPrice, c.vol, RULES.warrantDays);
  const warrantAt = (spot: number, days: number) => warrantValue(w.type, spot, w.strike, RULES.warrantDays - days * 1.4, w.vol);

  let exit: { i: number; price: number; reason: Trade["exitReason"] } | undefined;
  for (let i = signalIndex + 1; i < candles.length && i <= signalIndex + RULES.maxHoldDays; i++) {
    const bar = candles[i];
    const hitStop = long ? bar.low <= c.stop : bar.high >= c.stop;
    const hitTarget = long ? bar.high >= c.target : bar.low <= c.target;
    if (hitStop) {
      // Gap through the stop: filled at the open
      exit = { i, price: long ? Math.min(bar.open, c.stop) : Math.max(bar.open, c.stop), reason: "stop" };
      break;
    }
    if (hitTarget) {
      exit = { i, price: long ? Math.max(bar.open, c.target) : Math.min(bar.open, c.target), reason: "target" };
      break;
    }
    if (i === signalIndex + RULES.maxHoldDays) exit = { i, price: bar.close, reason: "time" };
  }

  const endIndex = exit?.i ?? candles.length - 1;
  const exitPrice = exit?.price ?? candles[candles.length - 1].close;
  const days = endIndex - signalIndex;
  const w0 = w.fairPrice;
  return {
    ...c,
    entryTime: entryBar.time,
    entryPrice,
    exitTime: exit ? candles[exit.i].time : undefined,
    exitPrice,
    exitReason: exit?.reason ?? "open",
    days,
    returnPct: (dir * (exitPrice - entryPrice)) / entryPrice * 100,
    warrantReturnPct: w0 > 0 ? (warrantAt(exitPrice, days) / w0 - 1) * 100 : 0,
  };
}

// All trades of one symbol from bar index `from` onwards. While a trade is
// running the symbol produces no new signal (one position per symbol).
export function replay(symbol: string, candles: Candle[], from: number): Trade[] {
  const trades: Trade[] = [];
  for (let d = Math.max(from, RULES.lookback); d < candles.length; d++) {
    const c = signalAt(symbol, candles.slice(0, d + 1));
    if (!c) continue;
    const trade = simulate(c, candles, d);
    if (!trade) continue;
    trades.push(trade);
    if (trade.exitReason === "open") break;
    d += trade.days; // continue after the exit bar
  }
  return trades;
}

export type PortfolioSettings = { startCapital: number; perTrade: number; instrument: "stock" | "warrant"; from?: number };

export type PortfolioResult = {
  trades: (Trade & { invested: number; pnl: number })[];
  equity: { time: number; value: number }[];
  final: number;
  returnPct: number;
  maxDrawdownPct: number;
  winRate?: number;
  closed: number;
  open: number;
};

// Portfolio simulation: every day the top `picksPerDay` signals (by score) are
// bought with a fixed amount each while cash allows; a symbol is not bought
// again while it is held.
export function runPortfolio(all: Trade[], s: PortfolioSettings): PortfolioResult {
  const byDay = new Map<number, Trade[]>();
  for (const t of all) {
    if (s.from != null && t.time < s.from) continue;
    byDay.set(t.entryTime, [...(byDay.get(t.entryTime) ?? []), t]);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  // Open positions are valued at the latest bar any trade has seen.
  const latest = Math.max(0, ...all.map((t) => t.exitTime ?? t.entryTime + t.days * 86400));
  let cash = s.startCapital;
  const held: (Trade & { invested: number; pnl: number })[] = [];
  const done: (Trade & { invested: number; pnl: number })[] = [];
  const events: { time: number; delta: number }[] = [];
  const ret = (t: Trade) => (s.instrument === "warrant" ? t.warrantReturnPct : t.returnPct) / 100;

  for (const day of days) {
    // settle positions that closed before this entry day
    for (let k = held.length - 1; k >= 0; k--) {
      const h = held[k];
      if (h.exitTime != null && h.exitTime < day) {
        cash += h.invested + h.pnl;
        done.push(h);
        held.splice(k, 1);
      }
    }
    const picks = byDay
      .get(day)!
      .filter((t) => !held.some((h) => h.symbol === t.symbol))
      .sort((a, b) => b.score - a.score)
      .slice(0, RULES.picksPerDay);
    for (const t of picks) {
      if (cash < s.perTrade) break;
      cash -= s.perTrade;
      const pnl = s.perTrade * Math.max(-1, ret(t));
      held.push({ ...t, invested: s.perTrade, pnl });
      events.push({ time: t.exitTime ?? latest, delta: pnl });
    }
  }
  const trades = [...done, ...held].sort((a, b) => a.entryTime - b.entryTime);

  // Equity curve from realised (and current open) P&L, ordered by exit date
  let value = s.startCapital;
  let peak = value;
  let maxDd = 0;
  const equity = [{ time: (s.from ?? trades[0]?.entryTime ?? 0) - 86400, value }];
  for (const e of events.sort((a, b) => a.time - b.time)) {
    value += e.delta;
    peak = Math.max(peak, value);
    maxDd = Math.max(maxDd, (peak - value) / peak);
    if (equity[equity.length - 1].time === e.time) equity[equity.length - 1].value = value;
    else equity.push({ time: e.time, value });
  }
  const closed = trades.filter((t) => t.exitReason !== "open");
  return {
    trades,
    equity,
    final: value,
    returnPct: (value / s.startCapital - 1) * 100,
    maxDrawdownPct: maxDd * 100,
    winRate: closed.length ? (closed.filter((t) => t.pnl > 0).length / closed.length) * 100 : undefined,
    closed: closed.length,
    open: trades.length - closed.length,
  };
}

export type PatternStat = { pattern: string; direction: string; count: number; winRate: number; avgReturn: number; avgWarrant: number; targetRate: number; stopRate: number };

export function patternStats(trades: Trade[]): PatternStat[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades.filter((t) => t.exitReason !== "open")) {
    const key = `${t.pattern}|${t.direction}`;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()]
    .map(([key, list]) => {
      const [pattern, direction] = key.split("|");
      const n = list.length;
      return {
        pattern,
        direction,
        count: n,
        winRate: (list.filter((t) => t.returnPct > 0).length / n) * 100,
        avgReturn: list.reduce((a, t) => a + t.returnPct, 0) / n,
        avgWarrant: list.reduce((a, t) => a + Math.max(-100, t.warrantReturnPct), 0) / n,
        targetRate: (list.filter((t) => t.exitReason === "target").length / n) * 100,
        stopRate: (list.filter((t) => t.exitReason === "stop").length / n) * 100,
      };
    })
    .sort((a, b) => b.count - a.count);
}
