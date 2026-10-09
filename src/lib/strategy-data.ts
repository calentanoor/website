import "server-only";
import { cacheLife } from "next/cache";
import { getIndex, INDICES } from "./indices";
import { getHistory, getStockSafe } from "./market-data";
import { prepare, replay, signalOn, RULES, STRATEGIES, type Candidate, type StrategyId, type Trade } from "./strategy";
import { warrantIdea, type WarrantIdea } from "./warrant";

// Strategy used for the "Top 5 heute" on the home page.
export const ACTIVE_STRATEGY: StrategyId = "momentum";

export const isStrategy = (v: string | null): v is StrategyId => !!v && v in STRATEGIES;

// Market filter: home index of a symbol
export function benchmarkOf(symbol: string) {
  if (symbol.endsWith(".DE")) return "^GDAXI";
  return symbol.includes(".") ? "^STOXX50E" : "^GSPC";
}

type Info = { name: string; currency: string };

async function infoFor(symbol: string): Promise<Info> {
  const s = await getStockSafe(symbol);
  return "error" in s ? { name: symbol, currency: "" } : { name: s.name, currency: s.currency };
}

// Backtest trades of one symbol over the test period (shared remote cache, so
// a long first computation is only paid once).
async function symbolTrades(strategy: StrategyId, symbol: string): Promise<Trade[]> {
  "use cache: remote";
  cacheLife({ stale: 3600, revalidate: 12 * 3600, expire: 3 * 86400 });
  const [candles, bench] = await Promise.all([getHistory(symbol), getHistory(benchmarkOf(symbol)).catch(() => undefined)]);
  const from = candles.length - RULES.testYears * 252;
  return replay(strategy, symbol, prepare(candles, bench), from);
}

export async function getIndexTrades(indexId: string, strategy: StrategyId): Promise<{ trades: Trade[]; info: Record<string, Info>; errors: string[] }> {
  const symbols = getIndex(indexId)?.constituents ?? [];
  const errors: string[] = [];
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const [trades, info] = await Promise.all([symbolTrades(strategy, symbol), infoFor(symbol)]);
        return { symbol, info, trades };
      } catch (e) {
        errors.push(`${symbol}: ${e instanceof Error ? e.message : String(e)}`);
        return { symbol, info: { name: symbol, currency: "" }, trades: [] as Trade[] };
      }
    }),
  );
  return { trades: results.flatMap((r) => r.trades), info: Object.fromEntries(results.map((r) => [r.symbol, r.info])), errors };
}

// Yearly buy-and-hold returns of the benchmark indices over the test period
export async function getBenchmarks(): Promise<{ symbol: string; name: string; returnPct: number; yearly: { year: number; returnPct: number }[] }[]> {
  const list = [
    ["^GSPC", "S&P 500"],
    ["^GDAXI", "DAX"],
    ["^STOXX50E", "Euro Stoxx 50"],
  ];
  const out = await Promise.all(
    list.map(async ([symbol, name]) => {
      try {
        const c = (await getHistory(symbol)).slice(-RULES.testYears * 252);
        const yearly: { year: number; returnPct: number }[] = [];
        let prev = c[0].close;
        for (let y = new Date(c[0].time * 1000).getUTCFullYear(); y <= new Date(c[c.length - 1].time * 1000).getUTCFullYear(); y++) {
          const inYear = c.filter((x) => new Date(x.time * 1000).getUTCFullYear() === y);
          if (!inYear.length) continue;
          const end = inYear[inYear.length - 1].close;
          yearly.push({ year: y, returnPct: (end / prev - 1) * 100 });
          prev = end;
        }
        return { symbol, name, returnPct: (c[c.length - 1].close / c[0].close - 1) * 100, yearly };
      } catch {
        return undefined;
      }
    }),
  );
  return out.filter((x): x is NonNullable<typeof x> => !!x);
}

export type Pick = Candidate & { name: string; currency: string; warrant: WarrantIdea };

// Today's top picks across all index members, ranked by signal score.
export async function getTopPicks(strategy: StrategyId = ACTIVE_STRATEGY, limit = RULES.picksPerDay): Promise<{ picks: Pick[]; candidates: number }> {
  const symbols = [...new Set(INDICES.flatMap((i) => i.constituents ?? []))];
  const benchmarks = new Map(
    await Promise.all(["^GSPC", "^GDAXI", "^STOXX50E"].map(async (b) => [b, await getHistory(b).catch(() => undefined)] as const)),
  );
  const signals = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const s = prepare(await getHistory(symbol), benchmarks.get(benchmarkOf(symbol)));
        return signalOn(strategy, symbol, s, s.c.length - 1);
      } catch {
        return undefined;
      }
    }),
  );
  const ranked = signals.filter((s): s is Candidate => !!s).sort((a, b) => b.score - a.score);
  const top = ranked.slice(0, limit);
  const infos = await Promise.all(top.map((c) => infoFor(c.symbol)));
  return {
    picks: top.map((c, i) => ({ ...c, ...infos[i], warrant: warrantIdea(c.direction, c.price, c.vol, RULES.warrantDays) })),
    candidates: ranked.length,
  };
}
