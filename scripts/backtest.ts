// Strategy research on real data (run in GitHub Actions, see .github/workflows/backtest.yml):
//   npx tsx scripts/backtest.ts [scripts/experiments.json]
// Downloads ~6 years of daily candles for all index members (cached in
// .cache/data), replays every experiment and prints in-sample (first 3 test
// years) vs. out-of-sample (last 2 years) results, so improvements found on
// old data can be checked on data they were not tuned on.
import fs from "node:fs";
import path from "node:path";
import YahooFinance from "yahoo-finance2";
import { INDICES } from "../src/lib/indices";
import { DEFAULT_PARAMS, prepare, replay, runPortfolio, setupStats, RULES, type Params, type StrategyId, type Trade } from "../src/lib/strategy";
import type { Candle } from "../src/lib/types";

// positionPct: % of equity per stock position; warrantPct: per warrant position
type Experiment = { name: string; strategy: StrategyId; params?: Partial<Params>; positionPct?: number; warrantPct?: number; maxPositions?: number };

const CACHE = ".cache/data";
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"], queue: { concurrency: 4 } });

async function history(symbol: string): Promise<Candle[]> {
  const file = path.join(CACHE, `${symbol.replace(/[^A-Za-z0-9.-]/g, "_")}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const chart = await yf.chart(symbol, { period1: new Date(Date.now() - 2300 * 86400000), interval: "1d", return: "array" });
  const candles = chart.quotes
    .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
    .map((q) => ({ time: Math.floor(q.date.getTime() / 1000), open: q.open!, high: q.high!, low: q.low!, close: q.close!, volume: q.volume ?? 0 }));
  fs.mkdirSync(CACHE, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(candles));
  return candles;
}

const benchmarkOf = (s: string) => (s.endsWith(".DE") ? "^GDAXI" : s.includes(".") ? "^STOXX50E" : "^GSPC");
const pct = (v?: number, d = 1) => (v == null || !Number.isFinite(v) ? "–" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`);
const cagr = (ret: number, years: number) => ((1 + ret / 100) ** (1 / years) - 1) * 100;

async function main() {
  const experiments: Experiment[] = JSON.parse(fs.readFileSync(process.argv[2] ?? "scripts/experiments.json", "utf8"));
  const symbols = [...new Set(INDICES.flatMap((i) => i.constituents ?? []))];
  const benches = ["^GSPC", "^GDAXI", "^STOXX50E"];

  const data = new Map<string, Candle[]>();
  const failed: string[] = [];
  await Promise.all(
    [...benches, ...symbols].map(async (s) => {
      try {
        data.set(s, await history(s));
      } catch (e) {
        failed.push(`${s} (${e instanceof Error ? e.message.slice(0, 60) : e})`);
      }
    }),
  );
  console.log(`Daten: ${data.size} Symbole, ${failed.length} Fehler${failed.length ? ": " + failed.join(", ") : ""}`);

  const series = new Map(symbols.filter((s) => data.has(s)).map((s) => [s, prepare(data.get(s)!, data.get(benchmarkOf(s)))]));
  const spx = data.get("^GSPC")!;
  const testStart = spx[spx.length - RULES.testYears * 252].time;
  const split = testStart + 3 * 365.25 * 86400;
  const end = spx[spx.length - 1].time;
  const isYears = (split - testStart) / (365.25 * 86400);
  const oosYears = (end - split) / (365.25 * 86400);

  const lines: string[] = [];
  const out = (l = "") => {
    console.log(l);
    lines.push(l);
  };
  out(`## Strategie-Backtest ${new Date(testStart * 1000).toISOString().slice(0, 10)} – ${new Date(end * 1000).toISOString().slice(0, 10)}`);
  out(`In-Sample bis ${new Date(split * 1000).toISOString().slice(0, 10)} (${isYears.toFixed(1)} J.), Out-of-Sample danach (${oosYears.toFixed(1)} J.)`);
  out();
  for (const b of benches) {
    const c = data.get(b);
    if (!c) continue;
    const at = (t: number) => c.find((x) => x.time >= t)!.close;
    out(`- ${b}: gesamt ${pct((c[c.length - 1].close / at(testStart) - 1) * 100)}, IS p.a. ${pct(cagr((at(split) / at(testStart) - 1) * 100, isYears))}, OOS p.a. ${pct(cagr((c[c.length - 1].close / at(split) - 1) * 100, oosYears))}`);
  }
  out();
  out("| Experiment | Instr. | Trades | Treffer | Gesamt p.a. | Max DD | IS p.a. | IS DD | OOS p.a. | OOS DD | Ø Tage |");
  out("|---|---|---|---|---|---|---|---|---|---|---|");

  const details: string[] = [];
  for (const ex of experiments) {
    const t0 = Date.now();
    const params = { ...DEFAULT_PARAMS, ...ex.params };
    const trades: Trade[] = [];
    for (const [symbol, s] of series) trades.push(...replay(ex.strategy, symbol, s, s.c.findIndex((c) => c.time >= testStart), params));
    for (const instrument of ["stock", "warrant"] as const) {
      const base = { startCapital: 10000, positionPct: instrument === "stock" ? ex.positionPct ?? 10 : ex.warrantPct ?? ex.positionPct ?? 10, costPct: instrument === "stock" ? 0.2 : 1, instrument, maxPositions: ex.maxPositions };
      const full = runPortfolio(trades, base);
      const is = runPortfolio(trades, { ...base, to: split });
      const oos = runPortfolio(trades, { ...base, from: split });
      const avgDays = full.trades.reduce((a, t) => a + t.days, 0) / Math.max(1, full.trades.length);
      out(
        `| ${ex.name} | ${instrument === "stock" ? "Aktie" : "OS"} | ${full.trades.length} | ${full.winRate?.toFixed(0) ?? "–"}% | ${pct(cagr(full.returnPct, RULES.testYears))} | ${full.maxDrawdownPct.toFixed(0)}% | ${pct(cagr(is.returnPct, isYears))} | ${is.maxDrawdownPct.toFixed(0)}% | ${pct(cagr(oos.returnPct, oosYears))} | ${oos.maxDrawdownPct.toFixed(0)}% | ${avgDays.toFixed(0)} |`,
      );
    }
    details.push(
      `**${ex.name}** (${((Date.now() - t0) / 1000).toFixed(0)} s, ${trades.length} Signale): ` +
        setupStats(trades)
          .slice(0, 6)
          .map((s) => `${s.pattern}/${s.direction === "bullish" ? "Call" : "Put"} n=${s.count} Treffer ${s.winRate.toFixed(0)}% Ø ${pct(s.avgReturn, 2)} Ø ${s.avgDays.toFixed(0)} T`)
          .join("; "),
    );
  }
  out();
  out("### Setups (alle Signale, vor Kosten)");
  details.forEach((d) => out(`- ${d}`));

  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  fs.mkdirSync("research", { recursive: true });
  fs.writeFileSync("research/latest.md", lines.join("\n") + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
