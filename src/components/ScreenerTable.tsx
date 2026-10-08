"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Signal } from "@/lib/rating";
import { changeColor, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { ScoreBadge, ScoreMeter } from "./ScoreBadge";
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

type SortKey = "name" | "price" | "changePercent" | "perf1m" | "forwardPE" | "dividendYield" | "earningsDate" | "fundamental" | "technical" | "total";

const columns: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "Aktie" },
  { key: "price", label: "Kurs", align: "right" },
  { key: "changePercent", label: "Tag", align: "right" },
  { key: "perf1m", label: "1 Mon.", align: "right" },
  { key: "forwardPE", label: "KGV erw.", align: "right" },
  { key: "dividendYield", label: "Dividende", align: "right" },
  { key: "earningsDate", label: "Zahlen", align: "right" },
  { key: "fundamental", label: "Fundamental", align: "right" },
  { key: "technical", label: "Technik", align: "right" },
  { key: "total", label: "Gesamt", align: "right" },
];

export function ScreenerTable({ rows, now }: { rows: ScreenerRow[]; now: number }) {
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

  const stats = useMemo(() => {
    const valid = rows.filter((r) => r.total != null);
    const avg = valid.length ? Math.round(valid.reduce((a, r) => a + (r.total ?? 0), 0) / valid.length) : undefined;
    return {
      avg,
      bullish: rows.filter((r) => r.signals.some((s) => s.tone === "bullish")).length,
      bearish: rows.filter((r) => r.signals.some((s) => s.tone === "bearish")).length,
      earnings: rows.filter((r) => r.earningsDate && r.earningsDate >= now - 86400000 && r.earningsDate <= now + 14 * 86400000).length,
      errors: rows.filter((r) => r.error).length,
    };
  }, [rows, now]);

  const selectClass = "rounded-md border border-border bg-background px-2 py-1.5 text-foreground outline-none focus:border-accent";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Ø Gesamt-Score" value={stats.avg ?? "–"} />
        <Stat label="mit bullishen Signalen" value={stats.bullish} tone="text-up" />
        <Stat label="mit bearishen Signalen" value={stats.bearish} tone="text-down" />
        <Stat label="Zahlen in den nächsten 14 Tagen" value={stats.earnings} />
      </div>

      <div className="rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 text-sm">
          <div className="relative">
            <svg className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <circle cx="9" cy="9" r="6" />
              <path d="m14 14 4 4" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, Ticker oder Sektor"
              className="w-64 rounded-md border border-border bg-background py-1.5 pl-8 pr-3 outline-none focus:border-accent"
            />
          </div>
          <label className="flex items-center gap-2 text-muted">
            Gesamt ab
            <select value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className={selectClass}>
              {[0, 40, 50, 60, 70].map((v) => (
                <option key={v} value={v}>{v === 0 ? "alle" : v}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-muted">
            Signale
            <select value={signalFilter} onChange={(e) => setSignalFilter(e.target.value as typeof signalFilter)} className={selectClass}>
              <option value="all">alle</option>
              <option value="bullish">bullish</option>
              <option value="bearish">bearish</option>
            </select>
          </label>
          <span className="ml-auto text-xs text-muted">
            {visible.length} von {rows.length} Werten
            {stats.errors > 0 && <span className="text-down"> · {stats.errors} ohne Daten</span>}
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 font-medium hover:text-foreground ${c.align === "right" ? "text-right" : "text-left"} ${c.key === "name" ? "pl-4" : ""}`}
                    onClick={() => toggle(c.key)}
                  >
                    {c.label}
                    <span className={`ml-0.5 inline-block w-2 ${sort.key === c.key ? "text-accent" : "opacity-0"}`}>{sort.desc ? "↓" : "↑"}</span>
                  </th>
                ))}
                <th className="whitespace-nowrap px-3 py-2.5 pr-4 text-left font-medium">Signale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {visible.map((r) => (
                <tr key={r.symbol} className="transition-colors hover:bg-accent/[0.04]">
                  <td className="max-w-72 py-2.5 pl-4 pr-3">
                    <Link href={`/stock/${encodeURIComponent(r.symbol)}`} className="block truncate font-medium hover:text-accent">
                      {r.name}
                    </Link>
                    <div className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted">
                      <span className="font-mono text-[11px]">{r.symbol}</span>
                      {r.sector && <span className="truncate">· {r.sector}</span>}
                    </div>
                    {r.error && <div className="truncate text-xs text-down" title={r.error}>Keine Daten: {r.error}</div>}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right">
                    <div className="tabular-nums">{r.price != null ? formatNumber(r.price) : "–"}</div>
                    <div className="text-[11px] text-muted">{r.currency}</div>
                  </td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${changeColor(r.changePercent)}`}>{formatPercent(r.changePercent)}</td>
                  <td className={`whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${changeColor(r.perf1m)}`}>{formatPercent(r.perf1m, 1)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{formatNumber(r.forwardPE, 1)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{r.dividendYield ? `${formatNumber(r.dividendYield, 1)} %` : "–"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right text-xs tabular-nums text-muted">{formatDate(r.earningsDate)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><ScoreBadge score={r.fundamental} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><ScoreBadge score={r.technical} /></td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right"><ScoreMeter score={r.total} /></td>
                  <td className="py-2.5 pl-3 pr-4"><SignalList signals={r.signals} compact /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Keine Werte für diese Filter.</p>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "" }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
      <div className={`text-2xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
