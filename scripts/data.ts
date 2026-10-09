// Shared data loading for the research scripts (cached in .cache/).
import fs from "node:fs";
import path from "node:path";
import YahooFinance from "yahoo-finance2";
import type { Candle } from "../src/lib/types";
import { parseAnnualReports, type AnnualReport } from "../src/lib/fundamentals-history";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"], queue: { concurrency: 4 } });
const safe = (s: string) => s.replace(/[^A-Za-z0-9.-]/g, "_");

async function cached<T>(dir: string, symbol: string, load: () => Promise<T>): Promise<T> {
  const file = path.join(".cache", dir, `${safe(symbol)}.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const value = await load();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
  return value;
}

export function history(symbol: string): Promise<Candle[]> {
  return cached("data", symbol, async () => {
    const chart = await yf.chart(symbol, { period1: new Date(Date.now() - 2300 * 86400000), interval: "1d", return: "array" });
    return chart.quotes
      .filter((q) => q.open != null && q.high != null && q.low != null && q.close != null)
      .map((q) => ({ time: Math.floor(q.date.getTime() / 1000), open: q.open!, high: q.high!, low: q.low!, close: q.close!, volume: q.volume ?? 0 }));
  });
}

export function annualReports(symbol: string): Promise<AnnualReport[]> {
  return cached("fundamentals", symbol, async () => {
    const rows = await yf.fundamentalsTimeSeries(symbol, { period1: "2015-01-01", type: "annual", module: "all" }, { validateResult: false });
    return parseAnnualReports(Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []);
  });
}

export function sector(symbol: string): Promise<string | null> {
  return cached("sector", symbol, async () => {
    const s = await yf.quoteSummary(symbol, { modules: ["assetProfile"] });
    return s.assetProfile?.sector ?? null;
  });
}

export const benchmarkOf = (s: string) => (s.endsWith(".DE") ? "^GDAXI" : s.includes(".") ? "^STOXX50E" : "^GSPC");
export const pct = (v?: number, d = 1) => (v == null || !Number.isFinite(v) ? "–" : `${v >= 0 ? "+" : ""}${v.toFixed(d)}%`);
export const cagr = (ret: number, years: number) => ((1 + ret / 100) ** (1 / years) - 1) * 100;
