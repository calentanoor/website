import "server-only";
import { INDICES } from "../indices";
import { getEurUsd, getStockSafe } from "../market-data";
import { buildRows } from "../screener";
import { realizedVol } from "../options-math";
import { strikeStep } from "../warrant";
import { DEFAULT_SETTINGS } from "./defaults";
import { callPrice, omega } from "./model";

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
  reasons: string[];
  profile?: WarrantProfile;
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

// Strongest stocks for the warrant strategy: fundamental and technical score
// ≥ 60, ranked by their average; with a suggested call profile.
export async function getStrategyPicks(limit = 10): Promise<{ picks: StrategyPick[]; candidates: number }> {
  const symbols = [...new Set(INDICES.flatMap((i) => i.constituents ?? []))];
  const [rows, eurusd] = await Promise.all([buildRows(symbols), getEurUsd().catch(() => undefined)]);
  const eligible = rows
    .filter((r) => !r.error && r.fundamental != null && r.technical != null && r.fundamental >= 60 && r.technical >= 60 && r.price)
    .map((r) => ({ r, score: (r.fundamental! + r.technical!) / 2 }))
    .sort((a, b) => b.score - a.score || b.r.technical! - a.r.technical!);

  const picks = await Promise.all(
    eligible.slice(0, limit).map(async ({ r, score }): Promise<StrategyPick> => {
      const stock = await getStockSafe(r.symbol);
      const vol = "error" in stock ? undefined : realizedVol(stock.candles.map((c) => c.close), 60);
      const reasons = [
        `Fundamental ${r.fundamental} · Technik ${r.technical}`,
        r.perf6m != null ? `6 Monate ${r.perf6m >= 0 ? "+" : ""}${r.perf6m.toFixed(0)} %` : undefined,
        r.analystScore != null && r.analystScore >= 70 ? `Analysten ${r.recommendation ?? "positiv"}` : undefined,
        ...r.signals.filter((s) => s.tone === "bullish").slice(0, 1).map((s) => s.short),
      ].filter((x): x is string => !!x);
      return {
        symbol: r.symbol,
        name: r.name,
        currency: r.currency ?? "",
        price: r.price!,
        changePercent: r.changePercent,
        fundamental: r.fundamental!,
        technical: r.technical!,
        score: Math.round(score),
        perf6m: r.perf6m,
        analystScore: r.analystScore,
        earningsDate: r.earningsDate,
        reasons,
        profile: vol ? profileFor(r.price!, Math.max(0.15, vol), eurusd, r.currency) : undefined,
      };
    }),
  );
  return { picks, candidates: eligible.length };
}
