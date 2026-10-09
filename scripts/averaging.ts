// Research: "Qualität + Nachkauf" (fundamental + technical entry, take profit,
// doubling down) on real data. Run via the workflow with script=averaging:
//   npx tsx scripts/averaging.ts [scripts/averaging.json]
import fs from "node:fs";
import { INDICES } from "../src/lib/indices";
import { prepare, RULES } from "../src/lib/strategy";
import { DEFAULT_AVERAGING, ladderUnits, markToMarket, replayAveraging, runAveraging, type AveragingParams, type Cycle } from "../src/lib/averaging";
import type { AnnualReport } from "../src/lib/fundamentals-history";
import type { Candle } from "../src/lib/types";
import { annualReports, benchmarkOf, cagr, history, pct, sector } from "./data";

type Experiment = { name: string; params?: Partial<AveragingParams>; capital?: number; base?: number };

async function main() {
  const experiments: Experiment[] = JSON.parse(fs.readFileSync(process.argv[2] ?? "scripts/averaging.json", "utf8"));
  const symbols = [...new Set(INDICES.flatMap((i) => i.constituents ?? []))];
  const benches = ["^GSPC", "^GDAXI", "^STOXX50E"];

  const prices = new Map<string, Candle[]>();
  const reports = new Map<string, AnnualReport[]>();
  const sectors = new Map<string, string | undefined>();
  const failed: string[] = [];
  await Promise.all(
    [...benches, ...symbols].map(async (s) => {
      try {
        prices.set(s, await history(s));
        if (!s.startsWith("^")) {
          reports.set(s, await annualReports(s).catch(() => []));
          sectors.set(s, (await sector(s).catch(() => null)) ?? undefined);
        }
      } catch (e) {
        failed.push(`${s} (${e instanceof Error ? e.message.slice(0, 60) : e})`);
      }
    }),
  );
  const withReports = [...reports.values()].filter((r) => r.length >= 2).length;
  const firstReport = Math.min(...[...reports.values()].flatMap((r) => r.map((x) => x.date)));
  console.log(`Daten: ${prices.size} Kursreihen, ${withReports} mit ≥ 2 Jahresabschlüssen (ältester ${new Date(firstReport * 1000).toISOString().slice(0, 10)}), Fehler: ${failed.length}`);

  const series = new Map(symbols.filter((s) => prices.has(s)).map((s) => [s, prepare(prices.get(s)!, prices.get(benchmarkOf(s)))]));
  const spx = prices.get("^GSPC")!;
  const testStart = spx[spx.length - RULES.testYears * 252].time;
  const split = testStart + 3 * 365.25 * 86400;
  const end = spx[spx.length - 1].time;
  const years = (end - testStart) / (365.25 * 86400);
  const isYears = (split - testStart) / (365.25 * 86400);
  const oosYears = (end - split) / (365.25 * 86400);
  const days = spx.filter((c) => c.time >= testStart).map((c) => c.time);
  const closeIndex = new Map([...prices].map(([s, c]) => [s, new Map(c.map((x) => [x.time, x.close]))]));
  // price on `time` or the last known close before it
  const closeAt = (symbol: string, time: number) => {
    const c = prices.get(symbol);
    const exact = closeIndex.get(symbol)?.get(time);
    if (exact != null || !c) return exact;
    let lo = 0;
    let hi = c.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (c[mid].time <= time) lo = mid;
      else hi = mid - 1;
    }
    return c[lo].time <= time ? c[lo].close : undefined;
  };

  const lines: string[] = [];
  const out = (l = "") => {
    console.log(l);
    lines.push(l);
  };
  out(`## Qualität + Nachkauf ${new Date(testStart * 1000).toISOString().slice(0, 10)} – ${new Date(end * 1000).toISOString().slice(0, 10)}`);
  out("Aktien, Kosten 0,2 % je Kauf/Verkauf. Max DD = täglich zu Marktpreisen bewertet (inkl. offener Verluste).");
  out();
  out("| Experiment | Kapital/Basis | Zyklen | Treffer | p.a. | Max DD | IS p.a. | OOS p.a. | Käufe 1/2/3/4 | offen (Ø) | Ø Tage | schlechtester | max. gebunden |");
  out("|---|---|---|---|---|---|---|---|---|---|---|---|---|");

  for (const ex of experiments) {
    const p = { ...DEFAULT_AVERAGING, ...ex.params };
    const capital = ex.capital ?? 20000;
    const base = ex.base ?? 1000;
    const cycles: Cycle[] = [];
    for (const [symbol, s] of series) {
      const from = s.c.findIndex((c) => c.time >= testStart);
      cycles.push(...replayAveraging(symbol, s, from, reports.get(symbol) ?? [], p, sectors.get(symbol)));
    }
    // costs: 0.2 % per purchase and per sale
    const net = cycles.map((c) => ({ ...c, returnPct: ((1 + c.returnPct / 100) * (1 - 0.002) - 1 - 0.002) * 100 }));
    const full = runAveraging(net, p, capital, base);
    const is = runAveraging(net, p, capital, base, undefined, split);
    const oos = runAveraging(net, p, capital, base, split);
    const mtm = markToMarket(full, capital, closeAt, days);
    const open = full.cycles.filter((c) => c.exitReason === "open");
    const avgOpen = open.length ? open.reduce((a, c) => a + c.returnPct, 0) / open.length : undefined;
    const worst = full.cycles.reduce((w, c) => (c.returnPct < (w?.returnPct ?? Infinity) ? c : w), undefined as Cycle | undefined);
    const avgDays = full.cycles.reduce((a, c) => a + c.days, 0) / Math.max(1, full.cycles.length);
    const counts = Array.from({ length: 4 }, (_, k) => full.buyCounts[k] ?? "–").join("/");
    out(
      `| ${ex.name} | ${capital / 1000}k/${base} (Leiter ${ladderUnits(p) * base}) | ${full.cycles.length} | ${full.winRate?.toFixed(0) ?? "–"}% | ${pct(cagr(full.returnPct, years))} | ${mtm.maxDrawdownPct.toFixed(0)}% | ${pct(cagr(is.returnPct, isYears))} | ${pct(cagr(oos.returnPct, oosYears))} | ${counts} | ${open.length} (${pct(avgOpen, 0)}) | ${avgDays.toFixed(0)} | ${worst ? `${worst.symbol} ${pct(worst.returnPct, 0)}` : "–"} | ${full.maxReservedPct.toFixed(0)}% |`,
    );
  }
  out();
  out(`Zum Vergleich: S&P 500 Kaufen und Halten ${pct(cagr((spx[spx.length - 1].close / closeAt("^GSPC", testStart)! - 1) * 100, years))} p.a.; Momentum-Standard (Aktie) +13,4 % p.a., Max DD 15 % (realisiert).`);

  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
  fs.mkdirSync("research", { recursive: true });
  fs.writeFileSync("research/latest.md", lines.join("\n") + "\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
