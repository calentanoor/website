// Chart pattern detection on daily candles (pure, usable on server and client).
//
// 1. Swing points (pivots) are found with a fractal window and filtered
//    ZigZag-style: consecutive pivots must differ by at least `minMove` ATRs.
// 2. Pattern rules work on the sequence of pivots: double tops/bottoms,
//    (inverse) head & shoulders, triangles/wedges/channels from trendlines
//    fitted through the latest pivot highs and lows, flags after a strong pole.
// 3. Horizontal support/resistance levels are clusters of pivot prices.
//
// Each pattern carries drawable lines, trigger/target/stop levels, a heuristic
// confidence and an options strategy idea.
import { atr, last, sma } from "./indicators";
import type { Candle } from "./types";
import { realizedVol } from "./options-math";
import { warrantIdea, type WarrantIdea } from "./warrant";

export type Direction = "bullish" | "bearish" | "neutral";
export type PatternStatus = "forming" | "breakout" | "breakdown";

export type PatternLine = { from: { time: number; price: number }; to: { time: number; price: number }; kind: "pattern" | "trigger" | "target" };

export type OptionsIdea = { strategy: string; legs: string; rationale: string; warrant?: WarrantIdea };

export type Pattern = {
  id: string;
  type: string;
  label: string;
  direction: Direction;
  status: PatternStatus;
  confidence: number; // 0–100
  startTime: number;
  endTime: number;
  breakoutTime?: number; // bar of the confirming break (unix seconds)
  trigger?: number; // level whose break confirms the pattern
  target?: number;
  stop?: number;
  description: string;
  lines: PatternLine[];
  idea?: OptionsIdea;
};

export type Level = { price: number; touches: number; kind: "support" | "resistance" };

type Pivot = { i: number; price: number; kind: "H" | "L"; tentative?: boolean };

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function findPivots(c: Candle[], window = 5, minMove = 1.5): Pivot[] {
  const atrs = atr(c.map((x) => x.high), c.map((x) => x.low), c.map((x) => x.close));
  const raw: Pivot[] = [];
  for (let i = window; i < c.length - window; i++) {
    const slice = c.slice(i - window, i + window + 1);
    if (c[i].high === Math.max(...slice.map((x) => x.high))) raw.push({ i, price: c[i].high, kind: "H" });
    if (c[i].low === Math.min(...slice.map((x) => x.low))) raw.push({ i, price: c[i].low, kind: "L" });
  }

  const pivots: Pivot[] = [];
  for (const p of raw) {
    const prev = pivots[pivots.length - 1];
    const a = atrs[p.i] || atrs[atrs.length - 1];
    if (!prev) pivots.push(p);
    else if (prev.kind === p.kind) {
      if ((p.kind === "H" && p.price > prev.price) || (p.kind === "L" && p.price < prev.price)) pivots[pivots.length - 1] = p;
    } else if (Math.abs(p.price - prev.price) >= minMove * a) pivots.push(p);
  }

  // Tentative pivot: the extreme since the last confirmed pivot (not yet
  // confirmed by `window` bars on the right), needed for patterns in progress.
  const lastPivot = pivots[pivots.length - 1];
  if (lastPivot) {
    const after = c.slice(lastPivot.i + 1);
    if (after.length) {
      const kind = lastPivot.kind === "H" ? "L" : "H";
      const values = after.map((x) => (kind === "H" ? x.high : x.low));
      const ext = kind === "H" ? Math.max(...values) : Math.min(...values);
      const i = lastPivot.i + 1 + values.indexOf(ext);
      if (Math.abs(ext - lastPivot.price) >= minMove * last(atrs) && i < c.length - 1) pivots.push({ i, price: ext, kind, tentative: true });
    }
  }
  return pivots;
}

// ---------------------------------------------------------------------------

type Ctx = { c: Candle[]; atr: number; price: number; n: number; volAvg: number };

const t = (ctx: Ctx, i: number) => ctx.c[Math.min(i, ctx.n - 1)].time;
const line = (ctx: Ctx, i0: number, p0: number, i1: number, p1: number, kind: PatternLine["kind"] = "pattern"): PatternLine => ({
  from: { time: t(ctx, i0), price: p0 },
  to: { time: t(ctx, i1), price: p1 },
  kind,
});

// First bar index after `from` whose close crosses `level(i)` in the given direction.
function crossIndex(ctx: Ctx, from: number, level: (i: number) => number, dir: "up" | "down") {
  for (let i = from + 1; i < ctx.n; i++) {
    const cl = ctx.c[i].close;
    if (dir === "up" ? cl > level(i) : cl < level(i)) return i;
  }
  return -1;
}

// A breakout whose price has fallen back into the pattern (by more than half
// an ATR) has failed and is not reported.
const failed = (ctx: Ctx, dir: "up" | "down", level: number) =>
  dir === "up" ? ctx.price < level - 0.5 * ctx.atr : ctx.price > level + 0.5 * ctx.atr;

const volumeBoost = (ctx: Ctx, i: number) => (ctx.volAvg > 0 && ctx.c[i]?.volume > 1.3 * ctx.volAvg ? 10 : 0);

// Breakouts older than this many bars are considered played out.
const FRESH = 15;

function doubleTopBottom(ctx: Ctx, pivots: Pivot[]): Pattern[] {
  const out: Pattern[] = [];
  for (let k = pivots.length - 1; k >= 2 && k >= pivots.length - 4; k--) {
    const [a, mid, b] = [pivots[k - 2], pivots[k - 1], pivots[k]];
    if (a.kind !== b.kind || ctx.n - 1 - b.i > 60) continue;
    const bottom = a.kind === "L";
    const span = b.i - a.i;
    const diff = Math.abs(a.price - b.price);
    const depth = Math.abs(mid.price - (bottom ? Math.min(a.price, b.price) : Math.max(a.price, b.price)));
    if (span < 10 || span > 120 || diff > Math.max(0.03 * mid.price, 1.2 * ctx.atr) || depth < 2.5 * ctx.atr || depth < 0.04 * mid.price) continue;

    const neckline = mid.price;
    const brk = crossIndex(ctx, b.i, () => neckline, bottom ? "up" : "down");
    if (brk >= 0 && (ctx.n - 1 - brk > FRESH || failed(ctx, bottom ? "up" : "down", neckline))) continue;
    // A pattern still forming must not have moved beyond its extreme again.
    if (brk < 0 && (bottom ? ctx.price < Math.min(a.price, b.price) : ctx.price > Math.max(a.price, b.price))) continue;

    const extreme = bottom ? Math.min(a.price, b.price) : Math.max(a.price, b.price);
    const target = bottom ? neckline + depth : neckline - depth;
    const confidence = clamp(35 + (1 - diff / Math.max(0.03 * mid.price, 1.2 * ctx.atr)) * 20 + (brk >= 0 ? 10 + volumeBoost(ctx, brk) : 0) - (b.tentative ? 10 : 0));
    out.push({
      id: `${bottom ? "dbottom" : "dtop"}-${a.i}`,
      type: bottom ? "double-bottom" : "double-top",
      label: bottom ? "Doppelboden" : "Doppeltop",
      direction: bottom ? "bullish" : "bearish",
      status: brk >= 0 ? (bottom ? "breakout" : "breakdown") : "forming",
      breakoutTime: brk >= 0 ? t(ctx, brk) : undefined,
      confidence: Math.round(confidence),
      startTime: t(ctx, a.i),
      endTime: t(ctx, brk >= 0 ? brk : ctx.n - 1),
      trigger: neckline,
      target,
      stop: bottom ? extreme * 0.99 : extreme * 1.01,
      description: bottom
        ? `Zwei Tiefs bei ${fmt(a.price)} und ${fmt(b.price)}, Nackenlinie ${fmt(neckline)}. ${brk >= 0 ? "Nackenlinie überwunden – Formation bestätigt." : "Bestätigung bei Schlusskurs über der Nackenlinie."}`
        : `Zwei Hochs bei ${fmt(a.price)} und ${fmt(b.price)}, Nackenlinie ${fmt(neckline)}. ${brk >= 0 ? "Nackenlinie unterschritten – Formation bestätigt." : "Bestätigung bei Schlusskurs unter der Nackenlinie."}`,
      lines: [
        line(ctx, a.i, a.price, mid.i, mid.price),
        line(ctx, mid.i, mid.price, b.i, b.price),
        line(ctx, a.i, neckline, ctx.n - 1, neckline, "trigger"),
      ],
    });
    break;
  }
  return out;
}

function headAndShoulders(ctx: Ctx, pivots: Pivot[]): Pattern[] {
  for (let k = pivots.length - 1; k >= 4 && k >= pivots.length - 3; k--) {
    const [s1, n1, h, n2, s2] = pivots.slice(k - 4, k + 1);
    if (s1.kind !== h.kind || h.kind !== s2.kind || ctx.n - 1 - s2.i > 50) continue;
    const top = h.kind === "H";
    const higher = (x: number, y: number) => (top ? x > y : x < y);
    if (!higher(h.price, s1.price) || !higher(h.price, s2.price)) continue;
    if (Math.abs(s1.price - s2.price) / h.price > 0.05) continue;
    if (Math.abs(h.price - Math.max(s1.price, s2.price)) < ctx.atr && top) continue;
    if (Math.abs(h.price - Math.min(s1.price, s2.price)) < ctx.atr && !top) continue;

    const slope = (n2.price - n1.price) / (n2.i - n1.i);
    const neck = (i: number) => n1.price + slope * (i - n1.i);
    const height = Math.abs(h.price - neck(h.i));
    if (height < 2 * ctx.atr) continue;
    const brk = crossIndex(ctx, s2.i, neck, top ? "down" : "up");
    if (brk >= 0 && (ctx.n - 1 - brk > FRESH || failed(ctx, top ? "down" : "up", neck(ctx.n - 1)))) continue;
    if (brk < 0 && higher(ctx.price, s2.price)) continue;

    const breakLevel = neck(brk >= 0 ? brk : ctx.n - 1);
    return [{
      id: `${top ? "hs" : "ihs"}-${s1.i}`,
      type: top ? "head-shoulders" : "inverse-head-shoulders",
      label: top ? "Schulter-Kopf-Schulter" : "Inverse SKS",
      direction: top ? "bearish" : "bullish",
      status: brk >= 0 ? (top ? "breakdown" : "breakout") : "forming",
      breakoutTime: brk >= 0 ? t(ctx, brk) : undefined,
      confidence: Math.round(clamp(45 + (brk >= 0 ? 10 + volumeBoost(ctx, brk) : 0) - (s2.tentative ? 10 : 0) + (Math.abs(slope) < ctx.atr / 20 ? 5 : 0))),
      startTime: t(ctx, s1.i),
      endTime: t(ctx, brk >= 0 ? brk : ctx.n - 1),
      trigger: breakLevel,
      target: top ? breakLevel - height : breakLevel + height,
      stop: top ? s2.price * 1.01 : s2.price * 0.99,
      description: `Kopf bei ${fmt(h.price)}, Schultern bei ${fmt(s1.price)} / ${fmt(s2.price)}, Nackenlinie aktuell ${fmt(breakLevel)}. ${
        brk >= 0 ? "Nackenlinie durchbrochen – Formation bestätigt." : `Bestätigung bei Schlusskurs ${top ? "unter" : "über"} der Nackenlinie.`
      }`,
      lines: [
        line(ctx, s1.i, s1.price, n1.i, n1.price),
        line(ctx, n1.i, n1.price, h.i, h.price),
        line(ctx, h.i, h.price, n2.i, n2.price),
        line(ctx, n2.i, n2.price, s2.i, s2.price),
        line(ctx, n1.i, neck(n1.i), ctx.n - 1, neck(ctx.n - 1), "trigger"),
      ],
    }];
  }
  return [];
}

function fit(points: Pivot[]) {
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.i, 0) / n;
  const my = points.reduce((a, p) => a + p.price, 0) / n;
  const sxx = points.reduce((a, p) => a + (p.i - mx) ** 2, 0);
  const slope = sxx ? points.reduce((a, p) => a + (p.i - mx) * (p.price - my), 0) / sxx : 0;
  const at = (i: number) => my + slope * (i - mx);
  const error = Math.max(...points.map((p) => Math.abs(p.price - at(p.i))));
  return { slope, at, error };
}

function trendlinePatterns(ctx: Ctx, pivots: Pivot[]): Pattern[] {
  const recent = pivots.filter((p) => p.i >= ctx.n - 120);
  const highs = recent.filter((p) => p.kind === "H").slice(-3);
  const lows = recent.filter((p) => p.kind === "L").slice(-3);
  if (highs.length < 2 || lows.length < 2 || highs.length + lows.length < 5) return [];

  const up = fit(highs);
  const lo = fit(lows);
  if (up.error > 0.8 * ctx.atr || lo.error > 0.8 * ctx.atr) return [];

  const start = Math.min(highs[0].i, lows[0].i);
  const end = ctx.n - 1;
  const widthStart = up.at(start) - lo.at(start);
  const widthEnd = up.at(end) - lo.at(end);
  if (widthStart <= 0 || widthEnd <= 0) return [];

  // Slopes expressed as ATR per 20 bars; below 0.4 counts as flat.
  const s = (slope: number) => (slope * 20) / ctx.atr;
  const [su, sl] = [s(up.slope), s(lo.slope)];
  const flat = (v: number) => Math.abs(v) < 0.4;
  const converging = widthEnd < widthStart * 0.75;
  const parallel = Math.abs(su - sl) < 0.5;

  let kind: { type: string; label: string; direction: Direction } | undefined;
  if (converging && flat(su) && sl > 0.4) kind = { type: "ascending-triangle", label: "Aufsteigendes Dreieck", direction: "bullish" };
  else if (converging && flat(sl) && su < -0.4) kind = { type: "descending-triangle", label: "Absteigendes Dreieck", direction: "bearish" };
  else if (converging && su < -0.4 && sl > 0.4) kind = { type: "symmetrical-triangle", label: "Symmetrisches Dreieck", direction: "neutral" };
  else if (converging && su > 0.4 && sl > su) kind = { type: "rising-wedge", label: "Steigender Keil", direction: "bearish" };
  else if (converging && sl < -0.4 && su < sl) kind = { type: "falling-wedge", label: "Fallender Keil", direction: "bullish" };
  else if (parallel && flat(su) && flat(sl)) kind = { type: "range", label: "Seitwärtsrange", direction: "neutral" };
  else if (parallel && su > 0.4 && sl > 0.4) kind = { type: "up-channel", label: "Aufwärtstrendkanal", direction: "bullish" };
  else if (parallel && su < -0.4 && sl < -0.4) kind = { type: "down-channel", label: "Abwärtstrendkanal", direction: "bearish" };
  if (!kind) return [];

  const last = Math.max(highs[highs.length - 1].i, lows[lows.length - 1].i);
  const upBreak = crossIndex(ctx, last, (i) => up.at(i), "up");
  const downBreak = crossIndex(ctx, last, (i) => lo.at(i), "down");
  const brk = [upBreak, downBreak].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1;
  if (brk >= 0 && ctx.n - 1 - brk > FRESH) return [];
  const status: PatternStatus = brk < 0 ? "forming" : brk === upBreak ? "breakout" : "breakdown";
  if (status === "breakout" && failed(ctx, "up", up.at(end))) return [];
  if (status === "breakdown" && failed(ctx, "down", lo.at(end))) return [];
  const direction: Direction = status === "breakout" ? "bullish" : status === "breakdown" ? "bearish" : kind.direction;

  const touches = highs.length + lows.length;
  const trigger = status === "breakdown" || (status === "forming" && kind.direction === "bearish") ? lo.at(end) : up.at(end);
  const height = widthStart;
  const target = direction === "bearish" ? trigger - height : direction === "bullish" ? trigger + height : undefined;
  const channel = kind.type.endsWith("channel") || kind.type === "range";

  const verb = status === "breakout" ? "nach oben ausgebrochen" : status === "breakdown" ? "nach unten ausgebrochen" : "intakt";
  return [{
    id: `${kind.type}-${start}`,
    type: kind.type,
    label: kind.label,
    direction,
    status,
    breakoutTime: brk >= 0 ? t(ctx, brk) : undefined,
    confidence: Math.round(clamp(25 + Math.min(touches, 6) * 5 + (brk >= 0 ? 10 + volumeBoost(ctx, brk) : 0) - ((up.error + lo.error) / ctx.atr) * 8)),
    startTime: t(ctx, start),
    endTime: t(ctx, end),
    trigger,
    target: channel && status === "forming" ? undefined : target,
    stop: status === "breakout" ? lo.at(end) : status === "breakdown" ? up.at(end) : undefined,
    description: `${touches} Berührungspunkte, obere Linie aktuell ${fmt(up.at(end))}, untere ${fmt(lo.at(end))} – Formation ${verb}.`,
    lines: [line(ctx, start, up.at(start), end, up.at(end)), line(ctx, start, lo.at(start), end, lo.at(end))],
  }];
}

function flags(ctx: Ctx): Pattern[] {
  const out: Pattern[] = [];
  for (const bull of [true, false]) {
    // Pole: steep 3–10 bar move (≥ 5 ATR and ≥ 8 %) ending 5–20 bars ago,
    // whose end is the extreme of the move.
    let best: { from: number; to: number; size: number } | undefined;
    for (let to = ctx.n - 21; to <= ctx.n - 6; to++) {
      if (to < 15) continue;
      for (let len = 3; len <= 10; len++) {
        const from = to - len;
        const size = bull ? ctx.c[to].high - ctx.c[from].low : ctx.c[from].high - ctx.c[to].low;
        const extreme = bull
          ? ctx.c[to].high >= Math.max(...ctx.c.slice(from, to + 1).map((x) => x.high))
          : ctx.c[to].low <= Math.min(...ctx.c.slice(from, to + 1).map((x) => x.low));
        if (extreme && size >= 5 * ctx.atr && size >= 0.08 * ctx.c[to].close && (!best || size > best.size)) best = { from, to, size };
      }
    }
    if (!best) continue;

    const poleEnd = bull ? ctx.c[best.to].high : ctx.c[best.to].low;
    const brk = crossIndex(ctx, best.to, () => poleEnd, bull ? "up" : "down");
    // The flag itself: at least 5 bars of consolidation before any breakout.
    const consEnd = brk >= 0 ? brk : ctx.n;
    if (consEnd - best.to - 1 < 5 || (brk >= 0 && (ctx.n - 1 - brk > FRESH || failed(ctx, bull ? "up" : "down", poleEnd)))) continue;
    const cons = ctx.c.slice(best.to + 1, consEnd);
    const hi = Math.max(...cons.map((x) => x.high));
    const lo = Math.min(...cons.map((x) => x.low));
    const retrace = bull ? (poleEnd - lo) / best.size : (hi - poleEnd) / best.size;
    // Tight, counter-trend or sideways drift: no new extreme, ≤ 50 % retracement.
    const drift = fit(cons.map((x, k) => ({ i: k, price: x.close, kind: "H" as const }))).slope * cons.length;
    if (retrace > 0.5 || hi - lo > 0.5 * best.size || (bull ? drift > 0.2 * best.size : drift < -0.2 * best.size)) continue;

    const status: PatternStatus = brk >= 0 ? (bull ? "breakout" : "breakdown") : "forming";
    out.push({
      id: `${bull ? "bullflag" : "bearflag"}-${best.from}`,
      type: bull ? "bull-flag" : "bear-flag",
      label: bull ? "Bullische Flagge" : "Bärische Flagge",
      direction: bull ? "bullish" : "bearish",
      status,
      breakoutTime: brk >= 0 ? t(ctx, brk) : undefined,
      confidence: Math.round(clamp(40 + (0.5 - retrace) * 30 + (brk >= 0 ? 10 + volumeBoost(ctx, brk) : 0))),
      startTime: t(ctx, best.from),
      endTime: t(ctx, ctx.n - 1),
      trigger: poleEnd,
      target: bull ? poleEnd + best.size : poleEnd - best.size,
      stop: bull ? lo * 0.99 : hi * 1.01,
      description: `Starker ${bull ? "Anstieg" : "Rückgang"} um ${fmt(best.size)} in ${best.to - best.from} Tagen, danach Konsolidierung mit ${Math.round(retrace * 100)} % Rücklauf. ${
        brk >= 0 ? "Ausbruch in Trendrichtung erfolgt." : `Fortsetzung bei Schlusskurs ${bull ? "über" : "unter"} ${fmt(poleEnd)}.`
      }`,
      lines: [
        line(ctx, best.from, bull ? ctx.c[best.from].low : ctx.c[best.from].high, best.to, poleEnd),
        line(ctx, best.to + 1, hi, consEnd - 1, hi),
        line(ctx, best.to + 1, lo, consEnd - 1, lo),
      ],
    });
  }
  return out;
}

export function supportResistance(c: Candle[], pivots: Pivot[], atrValue: number): Level[] {
  const price = c[c.length - 1].close;
  const clusters: { prices: number[] }[] = [];
  for (const p of pivots.filter((p) => p.i >= c.length - 250)) {
    const cl = clusters.find((x) => Math.abs(x.prices.reduce((a, b) => a + b, 0) / x.prices.length - p.price) < 0.6 * atrValue);
    if (cl) cl.prices.push(p.price);
    else clusters.push({ prices: [p.price] });
  }
  return clusters
    .filter((x) => x.prices.length >= 2)
    .map((x) => {
      const level = x.prices.reduce((a, b) => a + b, 0) / x.prices.length;
      return { price: level, touches: x.prices.length, kind: level < price ? ("support" as const) : ("resistance" as const) };
    })
    .sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
}

function levelBreakouts(ctx: Ctx, levels: Level[]): Pattern[] {
  const out: Pattern[] = [];
  for (const l of levels.filter((l) => l.touches >= 3)) {
    // Former resistance now below price (or support now above) after a recent cross
    const from = ctx.n - 6;
    const prev = ctx.c[from].close;
    const up = prev <= l.price && ctx.price > l.price * 1.005;
    const down = prev >= l.price && ctx.price < l.price * 0.995;
    if (!up && !down) continue;
    const brk = crossIndex(ctx, from, () => l.price, up ? "up" : "down");
    out.push({
      id: `level-${Math.round(l.price * 100)}`,
      type: up ? "resistance-breakout" : "support-breakdown",
      label: up ? "Ausbruch über Widerstand" : "Bruch der Unterstützung",
      direction: up ? "bullish" : "bearish",
      status: up ? "breakout" : "breakdown",
      breakoutTime: t(ctx, brk),
      confidence: Math.round(clamp(35 + Math.min(l.touches, 6) * 5 + volumeBoost(ctx, brk))),
      startTime: t(ctx, Math.max(0, ctx.n - 120)),
      endTime: t(ctx, ctx.n - 1),
      trigger: l.price,
      stop: up ? l.price - ctx.atr : l.price + ctx.atr,
      description: `${up ? "Widerstand" : "Unterstützung"} bei ${fmt(l.price)} (${l.touches} Berührungen) in den letzten Tagen ${up ? "überwunden" : "unterschritten"}.`,
      lines: [line(ctx, Math.max(0, ctx.n - 120), l.price, ctx.n - 1, l.price, "trigger")],
    });
  }
  return out.slice(0, 1);
}

// ---------------------------------------------------------------------------
// Warrant ideas: plain call or put, at the money, ~3 months

function ideaFor(p: Pattern, price: number, vol: number): OptionsIdea {
  if (p.direction === "neutral") {
    const upper = p.lines[0]?.to.price ?? price * 1.05;
    const lower = p.lines[1]?.to.price ?? price * 0.95;
    return {
      strategy: "Abwarten",
      legs: `Call bei Schlusskurs über ${fmt(upper)}, Put bei Schlusskurs unter ${fmt(lower)}`,
      rationale: "Richtung noch offen – erst den Ausbruch abwarten, dann Optionsschein in Ausbruchsrichtung.",
    };
  }
  const w = warrantIdea(p.direction, price, vol, 365, 0.9);
  const confirmed = p.status !== "forming";
  return {
    strategy: `${w.type}-Optionsschein`,
    legs: `Basis ${fmt(w.strike)}, 10 % im Geld, Laufzeit ca. 12 Monate (rollen bei < 3 Monaten), Hebel ca. ${fmt(Math.round(w.leverage * 10) / 10)}`,
    rationale: confirmed
      ? `Ausbruch bestätigt. Kursziel ${p.target ? fmt(p.target) : "–"}, Stopp im Basiswert ${p.stop ? fmt(p.stop) : "–"}.`
      : `Noch in Bildung – Einstieg erst bei Schlusskurs ${p.direction === "bullish" ? "über" : "unter"} ${fmt(p.trigger ?? price)}.`,
    warrant: w,
  };
}

// ---------------------------------------------------------------------------

const fmt = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: v < 10 ? 2 : v < 1000 ? 2 : 0, minimumFractionDigits: 0 });

export type PatternResult = { patterns: Pattern[]; levels: Level[] };

export function detectPatterns(candles: Candle[]): PatternResult {
  const c = candles.slice(-260);
  if (c.length < 60) return { patterns: [], levels: [] };
  const n = c.length;
  const atrValue = last(atr(c.map((x) => x.high), c.map((x) => x.low), c.map((x) => x.close)));
  const ctx: Ctx = { c, atr: atrValue, price: c[n - 1].close, n, volAvg: last(sma(c.map((x) => x.volume), 50)) };
  const pivots = findPivots(c);
  const levels = supportResistance(c, pivots, atrValue);

  const patterns = [
    ...headAndShoulders(ctx, pivots),
    ...doubleTopBottom(ctx, pivots),
    ...trendlinePatterns(ctx, pivots),
    ...flags(ctx),
    ...levelBreakouts(ctx, levels),
  ]
    .sort((a, b) => b.confidence - a.confidence)
    .map((p) => ({ ...p, idea: ideaFor(p, ctx.price, realizedVol(c.map((x) => x.close), 60) ?? 0.3) }));

  return { patterns, levels: levels.slice(0, 6) };
}

export const STATUS_LABEL: Record<PatternStatus, string> = { forming: "in Bildung", breakout: "Ausbruch ↑", breakdown: "Ausbruch ↓" };
