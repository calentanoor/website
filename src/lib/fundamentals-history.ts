// Point-in-time fundamentals from annual reports (Yahoo fundamentalsTimeSeries),
// so a backtest only uses figures that were published at the time. Reports
// count as known 90 days after the fiscal year end.
import { rateFundamentals } from "./rating";
import type { Fundamentals } from "./types";

export type AnnualReport = {
  date: number; // fiscal year end (unix seconds)
  revenue?: number;
  netIncome?: number;
  operatingIncome?: number;
  equity?: number;
  totalDebt?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  freeCashFlow?: number;
  eps?: number;
};

const PUBLICATION_LAG = 90 * 86400;

// Yahoo rows use either plain keys (totalRevenue) or prefixed ones (annualTotalRevenue).
function field(row: Record<string, unknown>, key: string): number | undefined {
  const v = row[key] ?? row[`annual${key[0].toUpperCase()}${key.slice(1)}`];
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

export function parseAnnualReports(rows: Record<string, unknown>[]): AnnualReport[] {
  return rows
    .map((r) => {
      const d = r.date instanceof Date ? r.date.getTime() / 1000 : typeof r.date === "number" ? (r.date > 1e11 ? r.date / 1000 : r.date) : Date.parse(String(r.date)) / 1000;
      return {
        date: Math.floor(d),
        revenue: field(r, "totalRevenue"),
        netIncome: field(r, "netIncome") ?? field(r, "netIncomeCommonStockholders"),
        operatingIncome: field(r, "operatingIncome"),
        equity: field(r, "stockholdersEquity"),
        totalDebt: field(r, "totalDebt"),
        currentAssets: field(r, "currentAssets"),
        currentLiabilities: field(r, "currentLiabilities"),
        freeCashFlow: field(r, "freeCashFlow"),
        eps: field(r, "dilutedEPS") ?? field(r, "basicEPS"),
      };
    })
    .filter((r) => Number.isFinite(r.date))
    .sort((a, b) => a.date - b.date);
}

const ratio = (a?: number, b?: number) => (a != null && b != null && b !== 0 ? a / b : undefined);

// Fundamentals as they were known at `time` for a share price of `price`.
export function fundamentalsAt(reports: AnnualReport[], time: number, price: number): Fundamentals | undefined {
  const known = reports.filter((r) => r.date + PUBLICATION_LAG <= time);
  const cur = known[known.length - 1];
  if (!cur) return undefined;
  const prev = known[known.length - 2];
  const pe = cur.eps != null && cur.eps > 0 ? price / cur.eps : cur.eps != null ? -1 : undefined;
  const earningsGrowth = prev?.netIncome && prev.netIncome > 0 && cur.netIncome != null ? cur.netIncome / prev.netIncome - 1 : undefined;
  return {
    trailingPE: pe,
    forwardPE: pe, // no historical estimates – use the trailing P/E
    pegRatio: pe != null && pe > 0 && earningsGrowth != null && earningsGrowth > 0 ? pe / (earningsGrowth * 100) : undefined,
    returnOnEquity: ratio(cur.netIncome, cur.equity),
    profitMargins: ratio(cur.netIncome, cur.revenue),
    operatingMargins: ratio(cur.operatingIncome, cur.revenue),
    revenueGrowth: prev?.revenue ? ratio(cur.revenue, prev.revenue)! - 1 : undefined,
    earningsGrowth,
    debtToEquity: cur.totalDebt != null && cur.equity && cur.equity > 0 ? (cur.totalDebt / cur.equity) * 100 : undefined,
    currentRatio: ratio(cur.currentAssets, cur.currentLiabilities),
    freeCashflow: cur.freeCashFlow,
  };
}

export function fundamentalScoreAt(reports: AnnualReport[], time: number, price: number, sector?: string): number | undefined {
  const f = fundamentalsAt(reports, time, price);
  if (!f) return undefined;
  const scores = rateFundamentals(f, price, sector)
    .map((c) => c.score)
    .filter((s): s is number => s != null);
  return scores.length >= 3 ? scores.reduce((a, b) => a + b, 0) / scores.length : undefined;
}
