import "server-only";
import { cacheLife } from "next/cache";
import { getIndex, INDICES } from "./indices";
import { getHistory, getStockSafe } from "./market-data";
import { replay, signalAt, RULES, type Candidate, type Trade } from "./strategy";
import { warrantIdea, type WarrantIdea } from "./warrant";

const TEST_BARS = 260; // ≈ 1 year of replayed signals

type Info = { name: string; currency: string };

async function infoFor(symbol: string): Promise<Info> {
  const s = await getStockSafe(symbol);
  return "error" in s ? { name: symbol, currency: "" } : { name: s.name, currency: s.currency };
}

// Backtest trades of one index (cached; replaying ~100 symbols takes a while).
export async function getIndexTrades(indexId: string): Promise<{ trades: Trade[]; info: Record<string, Info>; errors: string[] }> {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 6 * 3600, expire: 3 * 86400 });
  const symbols = getIndex(indexId)?.constituents ?? [];
  const errors: string[] = [];
  const results = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        const [candles, info] = await Promise.all([getHistory(symbol), infoFor(symbol)]);
        return { symbol, info, trades: replay(symbol, candles, candles.length - TEST_BARS) };
      } catch (e) {
        errors.push(`${symbol}: ${e instanceof Error ? e.message : String(e)}`);
        return { symbol, info: { name: symbol, currency: "" }, trades: [] as Trade[] };
      }
    }),
  );
  return {
    trades: results.flatMap((r) => r.trades),
    info: Object.fromEntries(results.map((r) => [r.symbol, r.info])),
    errors,
  };
}

export type Pick = Candidate & { name: string; currency: string; warrant: WarrantIdea };

// Today's top picks across all index members, ranked by signal score.
export async function getTopPicks(limit = RULES.picksPerDay): Promise<{ picks: Pick[]; candidates: number; asOf?: number }> {
  const symbols = [...new Set(INDICES.flatMap((i) => i.constituents ?? []))];
  const signals = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return signalAt(symbol, await getHistory(symbol));
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
    asOf: top[0]?.time,
  };
}
