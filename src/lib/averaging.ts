// "Qualität + Nachkauf": buy fundamentally and technically strong stocks with a
// fixed amount, take profit at +X % above the average cost, and double the
// position after every −Y % from the last purchase (limited number of buys).
//
// Pure functions; fundamentals come point-in-time from annual reports (see
// fundamentals-history.ts), so no look-ahead.
import { fundamentalScoreAt, type AnnualReport } from "./fundamentals-history";
import { rateTechnicals } from "./rating";
import type { Series } from "./strategy";

export type AveragingParams = {
  minFundamental: number;
  minTechnical: number;
  regime: boolean; // only open new cycles while the home index is above its SMA 200
  takeProfit: number; // 0.2 = sell at +20 % over the average cost
  addDrop: number; // 0.2 = buy more after −20 % from the last purchase
  addFactor: number; // 1 = add the amount invested so far (position doubles)
  maxBuys: number; // purchases per cycle including the first
  stopAfterLast?: number; // optional: sell at −X % below the average cost once all buys are used
  maxHoldDays?: number; // optional time limit (trading days)
};

export const DEFAULT_AVERAGING: AveragingParams = {
  minFundamental: 60,
  minTechnical: 60,
  regime: true,
  takeProfit: 0.2,
  addDrop: 0.2,
  addFactor: 1,
  maxBuys: 3,
};

export type Buy = { time: number; price: number; units: number }; // units of the base amount

export type Cycle = {
  symbol: string;
  score: number;
  fundamental: number;
  technical: number;
  signalTime: number;
  buys: Buy[];
  exitTime?: number;
  exitPrice: number; // last price while open
  exitReason: "target" | "stop" | "time" | "open";
  days: number;
  returnPct: number; // on the total amount invested
  invested: number; // units
};

// Units needed if every purchase of the ladder happens: 1, 1, 2, 4, …
export function ladderUnits(p: AveragingParams) {
  let total = 1;
  for (let k = 1; k < p.maxBuys; k++) total += total * p.addFactor;
  return total;
}

function technicalScore(s: Series, d: number) {
  const scores = rateTechnicals(s.c.slice(Math.max(0, d - 259), d + 1))
    .categories.map((c) => c.score)
    .filter((v): v is number => v != null);
  return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
}

export function averagingSignal(symbol: string, s: Series, d: number, reports: AnnualReport[], p: AveragingParams, sector?: string) {
  if (p.regime && s.regime?.[d] === false) return undefined;
  const fundamental = fundamentalScoreAt(reports, s.c[d].time, s.close[d], sector);
  if (fundamental == null || fundamental < p.minFundamental) return undefined;
  const technical = technicalScore(s, d);
  if (technical == null || technical < p.minTechnical) return undefined;
  return { symbol, fundamental, technical, score: (fundamental + technical) / 2, signalTime: s.c[d].time };
}

export function simulateCycle(sig: NonNullable<ReturnType<typeof averagingSignal>>, s: Series, d: number, p: AveragingParams): Cycle | undefined {
  const entry = s.c[d + 1];
  if (!entry) return undefined;
  const buys: Buy[] = [{ time: entry.time, price: entry.open, units: 1 }];
  let units = 1;
  let shares = 1 / entry.open; // shares per base amount
  let exit: { i: number; price: number; reason: Cycle["exitReason"] } | undefined;

  for (let i = d + 1; i < s.c.length; i++) {
    const bar = s.c[i];
    const avg = units / shares;
    const target = avg * (1 + p.takeProfit);
    // take-profit is checked before a possible add on the same bar
    if (bar.high >= target) {
      exit = { i, price: Math.max(bar.open, target), reason: "target" };
      break;
    }
    const last = buys[buys.length - 1];
    const addAt = last.price * (1 - p.addDrop);
    if (buys.length < p.maxBuys && bar.low <= addAt) {
      const price = Math.min(bar.open, addAt);
      const add = units * p.addFactor;
      buys.push({ time: bar.time, price, units: add });
      units += add;
      shares += add / price;
      continue;
    }
    if (buys.length >= p.maxBuys && p.stopAfterLast != null && bar.low <= avg * (1 - p.stopAfterLast)) {
      exit = { i, price: Math.min(bar.open, avg * (1 - p.stopAfterLast)), reason: "stop" };
      break;
    }
    if (p.maxHoldDays != null && i - d >= p.maxHoldDays) {
      exit = { i, price: bar.close, reason: "time" };
      break;
    }
  }

  const endIndex = exit?.i ?? s.c.length - 1;
  const exitPrice = exit?.price ?? s.c[s.c.length - 1].close;
  return {
    symbol: sig.symbol,
    score: sig.score,
    fundamental: sig.fundamental,
    technical: sig.technical,
    signalTime: sig.signalTime,
    buys,
    exitTime: exit ? s.c[endIndex].time : undefined,
    exitPrice,
    exitReason: exit?.reason ?? "open",
    days: endIndex - d,
    returnPct: ((shares * exitPrice) / units - 1) * 100,
    invested: units,
  };
}

// All cycles of one symbol from bar `from` on (one open cycle per symbol).
export function replayAveraging(symbol: string, s: Series, from: number, reports: AnnualReport[], p: AveragingParams, sector?: string): Cycle[] {
  const cycles: Cycle[] = [];
  for (let d = Math.max(from, 260); d < s.c.length; d++) {
    const sig = averagingSignal(symbol, s, d, reports, p, sector);
    if (!sig) continue;
    const c = simulateCycle(sig, s, d, p);
    if (!c) continue;
    cycles.push(c);
    if (c.exitReason === "open") break;
    d += c.days;
  }
  return cycles;
}

export type AveragingResult = {
  cycles: (Cycle & { base: number; pnl: number })[];
  final: number;
  returnPct: number;
  winRate?: number;
  skipped: number;
  maxReservedPct: number;
  buyCounts: number[]; // cycles by number of purchases used
};

// Portfolio: a new cycle starts only if the full ladder (base × ladderUnits)
// can be reserved from free cash; unused reserve is released at the exit.
export function runAveraging(all: Cycle[], p: AveragingParams, startCapital: number, base: number, from?: number, to?: number): AveragingResult {
  const reserve = base * ladderUnits(p);
  const candidates = all.filter((c) => (from == null || c.signalTime >= from) && (to == null || c.signalTime < to));
  const byDay = new Map<number, Cycle[]>();
  for (const c of candidates) byDay.set(c.buys[0].time, [...(byDay.get(c.buys[0].time) ?? []), c]);
  let cash = startCapital;
  let skipped = 0;
  let maxReserved = 0;
  const held: (Cycle & { base: number; pnl: number })[] = [];
  const done: (Cycle & { base: number; pnl: number })[] = [];
  for (const day of [...byDay.keys()].sort((a, b) => a - b)) {
    for (let k = held.length - 1; k >= 0; k--) {
      const h = held[k];
      if (h.exitTime != null && h.exitTime < day) {
        cash += reserve + h.pnl;
        done.push(h);
        held.splice(k, 1);
      }
    }
    for (const c of byDay.get(day)!.sort((a, b) => b.score - a.score)) {
      if (held.some((h) => h.symbol === c.symbol)) continue;
      if (cash < reserve) {
        skipped++;
        continue;
      }
      cash -= reserve;
      held.push({ ...c, base, pnl: (base * c.invested * c.returnPct) / 100 });
    }
    maxReserved = Math.max(maxReserved, (held.length * reserve) / startCapital);
  }
  const cycles = [...done, ...held].sort((a, b) => a.buys[0].time - b.buys[0].time);
  const final = startCapital + cycles.reduce((a, c) => a + c.pnl, 0);
  const closed = cycles.filter((c) => c.exitReason !== "open");
  const buyCounts = Array.from({ length: p.maxBuys }, (_, k) => cycles.filter((c) => c.buys.length === k + 1).length);
  return {
    cycles,
    final,
    returnPct: (final / startCapital - 1) * 100,
    winRate: closed.length ? (closed.filter((c) => c.pnl > 0).length / closed.length) * 100 : undefined,
    skipped,
    maxReservedPct: maxReserved * 100,
    buyCounts,
  };
}

// Daily mark-to-market equity (shows the drawdowns hidden in open positions).
export function markToMarket(result: AveragingResult, startCapital: number, closeAt: (symbol: string, time: number) => number | undefined, days: number[]) {
  const values: number[] = [];
  for (const day of days) {
    let v = startCapital;
    for (const c of result.cycles) {
      if (c.buys[0].time > day) continue;
      if (c.exitTime != null && c.exitTime <= day) {
        v += c.pnl;
        continue;
      }
      const price = closeAt(c.symbol, day);
      if (price == null) continue;
      let units = 0;
      let shares = 0;
      for (const b of c.buys) {
        if (b.time > day) continue;
        units += b.units;
        shares += b.units / b.price;
      }
      v += c.base * (shares * price - units);
    }
    values.push(v);
  }
  let peak = startCapital;
  let maxDd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    maxDd = Math.max(maxDd, (peak - v) / peak);
  }
  return { values, maxDrawdownPct: maxDd * 100 };
}
