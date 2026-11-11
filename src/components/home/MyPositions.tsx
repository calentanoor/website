"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ACTION_ORDER, fmtEur, fmtPct } from "@/lib/os/ladder";
import { useOsData, withBid } from "@/lib/os/use-os";
import { NumInput } from "@/app/strategie/ui/inputs";
import { TONE } from "@/app/strategie/ui/PositionCard";

// Home page: open warrant positions with a bid field and the next step.
export function MyPositions() {
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false);
  return isClient ? <Inner /> : <div className="h-48 animate-pulse rounded-xl bg-border/40" />;
}

function Inner() {
  const { views, live, setPositions, settings, loading, refresh } = useOsData();
  const open = views.filter((v) => v.position.status === "open").sort((a, b) => ACTION_ORDER[a.action.tone] - ACTION_ORDER[b.action.tone]);
  const invested = open.reduce((a, v) => a + v.invested, 0);
  const valued = open.filter((v) => v.value != null);
  const plBase = valued.reduce((a, v) => a + v.invested, 0);
  const pl = plBase ? (valued.reduce((a, v) => a + v.value!, 0) / plBase - 1) * 100 : undefined;
  const todo = open.filter((v) => v.action.tone !== "white" && v.action.tone !== "grey").length;

  return (
    <section className="min-w-0 space-y-3">
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Meine Positionen</h2>
          <p className="text-xs text-muted tabular-nums">
            {fmtEur(invested)} investiert{pl != null && <> · <span className={pl >= 0 ? "text-up" : "text-down"}>{fmtPct(pl)}</span></>}
            {todo > 0 && <> · <span className="font-medium text-foreground">{todo} zu tun</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refresh} disabled={loading} className="rounded-md px-2 py-1 text-xs text-muted hover:bg-border/50 disabled:opacity-50" aria-label="Kurse aktualisieren">
            {loading ? "lädt …" : "↻ Kurse"}
          </button>
          <Link href="/strategie" className="text-sm text-accent hover:underline">Strategie →</Link>
        </div>
      </div>

      {open.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-5 text-center text-sm text-muted">
          Noch keine offenen Positionen. <Link href="/strategie" className="text-accent hover:underline">Auf der Strategie-Seite anlegen</Link>.
        </p>
      ) : (
        <ul className="space-y-2">
          {open.map((v) => {
            const p = v.position;
            const q = live.quotes[p.symbol];
            const w = v.refWarrant;
            const tone = TONE[v.action.tone];
            return (
              <li key={p.id} className="rounded-xl border border-border bg-surface p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/strategie#pos-${p.id}`} className="min-w-0">
                    <div className="truncate font-medium">
                      {p.name ?? p.symbol} <span className="font-mono text-xs text-muted">{p.symbol}</span>
                    </div>
                    <div className="text-xs text-muted tabular-nums">
                      Aktie {q?.price ? `${q.price.toLocaleString("de-DE", { maximumFractionDigits: 2 })} ${q.currency ?? ""}` : "–"}
                      {q?.changePercent != null && <span className={q.changePercent >= 0 ? " text-up" : " text-down"}> {fmtPct(q.changePercent)}</span>}
                      {v.stage > 0 && ` · ${v.units.toLocaleString("de-DE", { maximumFractionDigits: 1 })}x`}
                    </div>
                  </Link>
                  <div className={`shrink-0 text-right text-lg font-semibold tabular-nums ${v.plPct == null ? "text-muted" : v.plPct >= 0 ? "text-up" : "text-down"}`}>{fmtPct(v.plPct)}</div>
                </div>
                <div className="mt-2 flex items-stretch gap-2">
                  {w && (
                    <label className="w-28 shrink-0">
                      <span className="block text-[10px] text-muted">Geld € {w.wkn ? `· ${w.wkn}` : ""}</span>
                      <NumInput value={w.bid} digits={3} onChange={(bid) => setPositions((ps) => ps.map((x) => (x.id === p.id ? withBid(x, w.id, bid) : x)))} className="!py-2 text-base" />
                    </label>
                  )}
                  <Link href={`/strategie#pos-${p.id}`} className={`flex min-w-0 flex-1 flex-col justify-center rounded-lg border px-2.5 py-1.5 ${tone.box}`}>
                    <span className="truncate text-sm font-medium">{tone.icon} {v.action.title}</span>
                    {v.action.detail && <span className="truncate text-xs opacity-90">{v.action.kind === "add" ? `${fmtEur((v.action.addMultiple ?? 1) * settings.x)} nachkaufen` : v.action.detail}</span>}
                  </Link>
                </div>
                {v.badges.some((b) => b.tone !== "info") && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {v.badges.filter((b) => b.tone !== "info").map((b) => (
                      <span key={b.label} className={`rounded-full px-1.5 py-0.5 text-[10px] ${b.tone === "danger" ? "bg-down/12 text-down" : "bg-neutral/15 text-neutral"}`}>{b.label}</span>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
