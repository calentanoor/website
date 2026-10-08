"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Signal } from "@/lib/rating";
import { changeColor, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { ScoreBadge } from "./ScoreBadge";
import { SignalList } from "./SignalList";

export type ScreenerRow = {
  symbol: string;
  name: string;
  sector?: string;
  currency?: string;
  price?: number;
  changePercent?: number;
  perf1m?: number;
  forwardPE?: number;
  dividendYield?: number;
  earningsDate?: number;
  fundamental?: number;
  technical?: number;
  total?: number;
  signals: Signal[];
  error?: string;
};

type SortKey = "name" | "changePercent" | "perf1m" | "forwardPE" | "dividendYield" | "earningsDate" | "fundamental" | "technical" | "total";

const columns: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "Aktie" },
  { key: "changePercent", label: "Tag", align: "right" },
  { key: "perf1m", label: "1 Mon.", align: "right" },
  { key: "forwardPE", label: "KGV e.", align: "right" },
  { key: "dividendYield", label: "Div.", align: "right" },
  { key: "earningsDate", label: "Zahlen", align: "right" },
  { key: "fundamental", label: "Fundam.", align: "right" },
  { key: "technical", label: "Technik", align: "right" },
  { key: "total", label: "Gesamt", align: "right" },
];

export function ScreenerTable({ rows }: { rows: ScreenerRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "total", desc: true });
  const [query, setQuery] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [signalFilter, setSignalFilter] = useState<"all" | "bullish" | "bearish">("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter(
      (r) =>
        (!q || r.name.toLowerCase().includes(q) || r.symbol.toLowerCase().includes(q) || r.sector?.toLowerCase().includes(q)) &&
        (minScore === 0 || (r.total ?? 0) >= minScore) &&
        (signalFilter === "all" || r.signals.some((s) => s.tone === signalFilter)),
    );
    return filtered.sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sort.desc ? -cmp : cmp;
    });
  }, [rows, query, minScore, signalFilter, sort]);

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: key !== "name" && key !== "earningsDate" && key !== "forwardPE" }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Suche Name, Ticker, Sektor …"
          className="w-64 rounded-md border border-border bg-surface px-3 py-1.5 outline-none focus:border-accent"
        />
        <label className="flex items-center gap-2 text-muted">
          Gesamt ≥
          <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="rounded-md border border-border bg-surface px-2 py-1.5 text-foreground">
            {[0, 40, 50, 60, 70].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-muted">
          Signale
          <select value={signalFilter} onChange={(e) => setSignalFilter(e.target.value as typeof signalFilter)} className="rounded-md border border-border bg-surface px-2 py-1.5 text-foreground">
            <option value="all">alle</option>
            <option value="bullish">bullish</option>
            <option value="bearish">bearish</option>
          </select>
        </label>
        <span className="text-muted">{visible.length} Treffer</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-xs text-muted">
            <tr>
              {columns.map((c) => (
                <th key={c.key} className={`cursor-pointer select-none px-3 py-2 font-medium ${c.align === "right" ? "text-right" : "text-left"}`} onClick={() => toggle(c.key)}>
                  {c.label}
                  {sort.key === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium">Signale</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.symbol} className="border-b border-border/60 last:border-0 hover:bg-background/60">
                <td className="px-3 py-2">
                  <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="font-medium hover:text-accent">
                    {r.name}
                  </Link>
                  <div className="text-xs text-muted">
                    {r.symbol}
                    {r.sector ? ` · ${r.sector}` : ""}
                    {r.price != null ? ` · ${formatNumber(r.price)} ${r.currency ?? ""}` : ""}
                  </div>
                  {r.error && <div className="text-xs text-down">Keine Daten: {r.error}</div>}
                </td>
                <td className={`px-3 py-2 text-right ${changeColor(r.changePercent)}`}>{formatPercent(r.changePercent)}</td>
                <td className={`px-3 py-2 text-right ${changeColor(r.perf1m)}`}>{formatPercent(r.perf1m, 1)}</td>
                <td className="px-3 py-2 text-right">{formatNumber(r.forwardPE, 1)}</td>
                <td className="px-3 py-2 text-right">{r.dividendYield ? `${formatNumber(r.dividendYield, 1)} %` : "–"}</td>
                <td className="px-3 py-2 text-right text-xs">{formatDate(r.earningsDate)}</td>
                <td className="px-3 py-2 text-right"><ScoreBadge score={r.fundamental} /></td>
                <td className="px-3 py-2 text-right"><ScoreBadge score={r.technical} /></td>
                <td className="px-3 py-2 text-right"><ScoreBadge score={r.total} /></td>
                <td className="max-w-72 px-3 py-2"><SignalList signals={r.signals} compact /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
