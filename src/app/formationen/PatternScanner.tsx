"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { PatternRow } from "@/lib/screener";
import { STATUS_LABEL, type Direction } from "@/lib/patterns";
import { useWatchlist } from "@/lib/storage";
import { formatNumber, formatPercent } from "@/lib/format";
import { ScoreBadge } from "@/components/ScoreBadge";
import { WatchStar } from "@/components/WatchStar";

const DIRECTION: Record<Direction, { label: string; className: string }> = {
  bullish: { label: "bullisch", className: "text-up" },
  bearish: { label: "bärisch", className: "text-down" },
  neutral: { label: "neutral", className: "text-accent" },
};

export function PatternScanner({ indices }: { indices: { id: string; name: string }[] }) {
  const watchlist = useWatchlist();
  const [universe, setUniverse] = useState<string[]>([indices[0].id]);
  const [direction, setDirection] = useState<"all" | Direction>("all");
  const [status, setStatus] = useState<"all" | "breakout" | "forming">("all");
  const [type, setType] = useState("all");
  const [minConfidence, setMinConfidence] = useState(60);
  const [state, setState] = useState<{ key: string; rows?: PatternRow[]; error?: string }>({ key: "" });

  const indexIds = universe.filter((u) => u !== "watchlist");
  const symbols = universe.includes("watchlist") ? watchlist.list : [];
  const key = `index=${indexIds.join(",")}&symbols=${symbols.map(encodeURIComponent).join(",")}`;
  const empty = !indexIds.length && !symbols.length;

  useEffect(() => {
    if (empty) return;
    let cancelled = false;
    fetch(`/api/patterns?${key}`)
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? res.statusText);
        if (!cancelled) setState({ key, rows: body.rows });
      })
      .catch((e) => !cancelled && setState({ key, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, [key, empty]);

  const loaded = state.key === key ? state : undefined;
  const all = useMemo(
    () => (loaded?.rows ?? []).flatMap((row) => row.patterns.map((p) => ({ row, p }))),
    [loaded],
  );
  const types = useMemo(() => [...new Map(all.map(({ p }) => [p.type, p.label])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [all]);
  const visible = all
    .filter(({ p }) =>
      (direction === "all" || p.direction === direction) &&
      (status === "all" || (status === "forming" ? p.status === "forming" : p.status !== "forming")) &&
      (type === "all" || p.type === type) &&
      p.confidence >= minConfidence,
    )
    .sort((a, b) => b.p.confidence - a.p.confidence);

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ring-1 ring-inset transition-colors ${active ? "bg-accent/10 text-accent ring-accent/40" : "text-muted ring-border hover:text-foreground"}`;
  const toggle = (id: string) => setUniverse((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));
  const select = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {indices.map((i) => (
            <button key={i.id} onClick={() => toggle(i.id)} className={chip(universe.includes(i.id))}>{i.name}</button>
          ))}
          <button onClick={() => toggle("watchlist")} className={chip(universe.includes("watchlist"))}>★ Watchlist ({watchlist.list.length})</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <label className="flex items-center gap-2">
            Richtung
            <select value={direction} onChange={(e) => setDirection(e.target.value as typeof direction)} className={select}>
              <option value="all">alle</option>
              <option value="bullish">bullisch</option>
              <option value="bearish">bärisch</option>
              <option value="neutral">neutral</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={select}>
              <option value="all">alle</option>
              <option value="breakout">nur Ausbrüche</option>
              <option value="forming">in Bildung</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            Formation
            <select value={type} onChange={(e) => setType(e.target.value)} className={select}>
              <option value="all">alle</option>
              {types.map(([t, label]) => (
                <option key={t} value={t}>{label}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            Konfidenz ab
            <select value={minConfidence} onChange={(e) => setMinConfidence(Number(e.target.value))} className={select}>
              {[0, 50, 60, 70, 80].map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {empty ? (
        <p className="text-sm text-muted">Bitte mindestens einen Index oder die Watchlist wählen.</p>
      ) : loaded?.error ? (
        <p className="text-sm text-down">Fehler beim Laden: {loaded.error}</p>
      ) : !loaded ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted shadow-sm">
          <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          Analysiere Charts … Beim ersten Aufruf eines Index kann das bis zu einer Minute dauern.
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">{visible.length}</span> Formationen in {new Set(visible.map((v) => v.row.symbol)).size} Werten
          </p>
          <div className="overflow-x-auto rounded-xl border border-border bg-surface shadow-sm">
            <table className="w-full min-w-[1000px] text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  {["Aktie", "Formation", "Status", "Konf.", "Auslöser", "Kursziel", "Optionsidee"].map((h, i) => (
                    <th key={h} className={`whitespace-nowrap px-3 py-2.5 font-medium ${i >= 3 && i <= 5 ? "text-right" : "text-left"} ${i === 0 ? "pl-4" : ""}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {visible.map(({ row, p }) => {
                  const toTrigger = p.trigger ? (p.trigger / row.price - 1) * 100 : undefined;
                  const potential = p.target ? (p.target / row.price - 1) * 100 : undefined;
                  return (
                    <tr key={`${row.symbol}-${p.id}`} className="align-top hover:bg-accent/[0.04]">
                      <td className="py-2.5 pl-4 pr-3">
                        <div className="flex items-center gap-1.5">
                          <WatchStar symbol={row.symbol} />
                          <Link href={`/stock/${encodeURIComponent(row.symbol)}#formationen`} className="font-medium hover:text-accent">{row.name}</Link>
                        </div>
                        <div className="pl-6 text-xs text-muted">
                          <span className="font-mono">{row.symbol}</span> · {formatNumber(row.price)} {row.currency}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div>{p.label}</div>
                        <div className={`text-xs ${DIRECTION[p.direction].className}`}>{DIRECTION[p.direction].label}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5">{STATUS_LABEL[p.status]}</td>
                      <td className="px-3 py-2.5 text-right"><ScoreBadge score={p.confidence} /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                        {formatNumber(p.trigger)}
                        <div className="text-xs text-muted">{formatPercent(toTrigger, 1)}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                        {formatNumber(p.target)}
                        <div className={`text-xs ${potential == null ? "text-muted" : potential >= 0 ? "text-up" : "text-down"}`}>{formatPercent(potential, 1)}</div>
                      </td>
                      <td className="max-w-80 px-3 py-2.5 pr-4">
                        {p.idea && (
                          <>
                            <div className="font-medium">{p.idea.strategy}</div>
                            <div className="text-xs text-muted">{p.idea.legs}</div>
                            {row.hasOptions && (
                              <Link href={`/optionen/${encodeURIComponent(row.symbol)}`} className="text-xs text-accent hover:underline">Optionskette →</Link>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {visible.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted">Keine Formationen für diese Filter.</p>}
          </div>
        </>
      )}
    </div>
  );
}
