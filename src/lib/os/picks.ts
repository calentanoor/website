import "server-only";
import { INDICES } from "../indices";
import { getEurUsd, getStockSafe } from "../market-data";
import { buildRows } from "../screener";
import { realizedVol } from "../options-math";
import { strikeStep } from "../warrant";
import { DEFAULT_SETTINGS } from "./defaults";
import { callPrice, omega } from "./model";
import { PULLBACK_RULES, pullbackMetrics, pullbackScore, qualifiesForPullback, type PullbackMetrics } from "./pullback";

export type WarrantProfile = {
  months: number;
  strike: number; // in the share's currency
  omega: number;
  pricePerShare: number;
  priceEur?: number; // ratio 0.1
  vol: number;
  withinRules: boolean; // strike ≤ 1.5 × price
};

export type StrategyPick = {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  changePercent?: number;
  fundamental: number;
  technical: number;
  score: number;
  perf6m?: number;
  analystScore?: number;
  earningsDate?: number;
  marketCapEur?: number;
  drawdownPct?: number; // below the 52-week high, positive number
  reasons: string[];
  profile?: WarrantProfile;
};

export type PicksResult = {
  pullback: StrategyPick[]; // quality in a pullback (default list)
  strength: StrategyPick[]; // fundamental and technical score ≥ 60
  counts: { pullback: number; strength: number; universe: number };
  minMarketCapEur: number;
};

const TARGET_OMEGA = 2.75;

// Strike at which a call with `months` to expiry has the target omega (omega rises with the strike)
function strikeForOmega(S: number, months: number, vol: number): { strike: number; omega: number } | undefined {
  const T = months / 12;
  const r = DEFAULT_SETTINGS.rate;
  const f = (K: number) => omega({ S, K, T, sigma: vol, r }) - TARGET_OMEGA;
  let lo = S * 0.3;
  let hi = S * 3;
  if (f(lo) > 0 || f(hi) < 0) return undefined;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  const step = strikeStep(S);
  const strike = Math.max(step, Math.round((lo + hi) / 2 / step) * step);
  return { strike, omega: omega({ S, K: strike, T, sigma: vol, r }) };
}

function profileFor(S: number, vol: number, eurusd?: number, currency?: string): WarrantProfile | undefined {
  // prefer 18 months; if that needs a strike above 1.5 × price, a longer maturity lowers the strike
  for (const months of [18, 24, 30]) {
    const k = strikeForOmega(S, months, vol);
    if (!k) continue;
    const within = k.strike <= DEFAULT_SETTINGS.finder.maxStrikeFactor * S;
    if (within || months === 30) {
      const pricePerShare = callPrice({ S, K: k.strike, T: months / 12, sigma: vol, r: DEFAULT_SETTINGS.rate });
      const fx = currency === "USD" ? eurusd : currency === "EUR" ? 1 : undefined;
      return { months, strike: k.strike, omega: k.omega, pricePerShare, priceEur: fx ? (pricePerShare * 0.1) / fx : undefined, vol, withinRules: within };
    }
  }
  return undefined;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(0)} %`;

// Both recommendation lists for the warrant strategy. Only companies with a
// market cap of at least 20 bn EUR (enough long-dated warrants on them).
export async function getStrategyPicks(limit = 10): Promise<PicksResult> {
  const symbols = [...new Set(INDICES.flatMap((i) => i.constituents ?? []))];
  const [rows, eurusd] = await Promise.all([buildRows(symbols), getEurUsd().catch(() => undefined)]);
  const capEur = (cap?: number, currency?: string) => (cap == null ? undefined : currency === "USD" ? (eurusd ? cap / eurusd : undefined) : cap);
  const large = rows
    .filter((r) => !r.error && r.fundamental != null && r.price)
    .map((r) => ({ r, cap: capEur(r.marketCap, r.currency) }))
    .filter((x) => x.cap != null && x.cap >= PULLBACK_RULES.minMarketCapEur);

  // price history for the pullback metrics and the warrant profile (cached per symbol)
  const stocks = new Map(await Promise.all(large.map(async ({ r }) => [r.symbol, await getStockSafe(r.symbol)] as const)));
  const metricsOf = (symbol: string): PullbackMetrics | undefined => {
    const st = stocks.get(symbol);
    return st && !("error" in st) ? pullbackMetrics(st.candles) : undefined;
  };

  const toPick = ({ r, cap }: (typeof large)[number], score: number, reasons: string[]): StrategyPick => {
    const st = stocks.get(r.symbol);
    const vol = st && !("error" in st) ? realizedVol(st.candles.map((c) => c.close), 60) : undefined;
    const m = metricsOf(r.symbol);
    return {
      symbol: r.symbol,
      name: r.name,
      currency: r.currency ?? "",
      price: r.price!,
      changePercent: r.changePercent,
      fundamental: r.fundamental!,
      technical: r.technical ?? 0,
      score: Math.round(score),
      perf6m: r.perf6m,
      analystScore: r.analystScore,
      earningsDate: r.earningsDate,
      marketCapEur: cap,
      drawdownPct: m ? m.drawdown * 100 : undefined,
      reasons,
      profile: vol ? profileFor(r.price!, Math.max(0.15, vol), eurusd, r.currency) : undefined,
    };
  };

  // 1) quality in a pullback
  const pullbackRanked = large
    .map((x) => ({ x, m: metricsOf(x.r.symbol) }))
    .filter(({ x, m }) => m && qualifiesForPullback(m, x.r.fundamental!, x.cap))
    .map(({ x, m }) => ({ x, m: m!, score: pullbackScore(m!, x.r.fundamental!, x.r.targetUpside) }))
    .sort((a, b) => b.score - a.score);
  const pullback = pullbackRanked.slice(0, limit).map(({ x, m, score }) =>
    toPick(
      x,
      score,
      [
        `Fundamental ${x.r.fundamental}`,
        `${pct(-m.drawdown * 100)} vom Hoch`,
        x.r.targetUpside != null ? `Kursziel ${pct(x.r.targetUpside)}` : undefined,
        m.rsi != null ? `RSI ${m.rsi.toFixed(0)}${m.rsiRising ? " ↑" : ""}` : undefined,
        m.ret5d != null && m.ret5d > 0.0005 ? `5 Tage +${(m.ret5d * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %` : undefined,
        m.vsSma200 == null ? undefined : Math.abs(m.vsSma200) < 0.005 ? "an der SMA 200" : m.vsSma200 > 0 ? "über SMA 200" : `${(m.vsSma200 * 100).toFixed(0)} % unter SMA 200`,
      ].filter((v): v is string => !!v),
    ),
  );

  // 2) strength: fundamental and technical score ≥ 60
  const strengthRanked = large
    .filter(({ r }) => r.technical != null && r.fundamental! >= 60 && r.technical >= 60)
    .map((x) => ({ x, score: (x.r.fundamental! + x.r.technical!) / 2 }))
    .sort((a, b) => b.score - a.score || b.x.r.technical! - a.x.r.technical!);
  const strength = strengthRanked.slice(0, limit).map(({ x, score }) =>
    toPick(
      x,
      score,
      [
        `Fundamental ${x.r.fundamental} · Technik ${x.r.technical}`,
        x.r.perf6m != null ? `6 Monate ${pct(x.r.perf6m)}` : undefined,
        x.r.analystScore != null && x.r.analystScore >= 70 ? `Analysten ${x.r.recommendation ?? "positiv"}` : undefined,
        ...x.r.signals.filter((sg) => sg.tone === "bullish").slice(0, 1).map((sg) => sg.short),
      ].filter((v): v is string => !!v),
    ),
  );

  return {
    pullback,
    strength,
    counts: { pullback: pullbackRanked.length, strength: strengthRanked.length, universe: large.length },
    minMarketCapEur: PULLBACK_RULES.minMarketCapEur,
  };
}
