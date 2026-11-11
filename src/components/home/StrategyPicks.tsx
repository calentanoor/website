"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { PicksResult, StrategyPick } from "@/lib/os/picks";
import { fmtEur, fmtPct } from "@/lib/os/ladder";
import { useOsData } from "@/lib/os/use-os";
import { ScoreBadge } from "@/components/ScoreBadge";

const DAY = 86400000;

type Mode = "pullback" | "strength";

const MODES: Record<Mode, { label: string; title: string; description: string }> = {
  pullback: {
    label: "Rücksetzer",
    title: "Qualität im Rücksetzer",
    description: "Fundamental ≥ 65, 5–40 % unter dem 52-Wochen-Hoch, Langfristtrend intakt · gewichtet: Fundamental 45 %, Rücksetzer 25 %, Kursziel 15 %, Stabilisierung 15 %",
  },
  strength: {
    label: "Stärke",
    title: "Stärkste Werte",
    description: "Fundamental und Technik ≥ 60, sortiert nach dem Mittel",
  },
};

// Top picks without the shares already held (positions live in the browser).
export function StrategyPicks({ result, limit = 5 }: { result: PicksResult; limit?: number }) {
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false);
  const [mode, setMode] = useState<Mode>("pullback");
  const caption = `ab ${(result.minMarketCapEur / 1e9).toLocaleString("de-DE")} Mrd. € Börsenwert · ${result.counts[mode]} von ${result.counts.universe} großen Werten erfüllen die Kriterien`;
  return (
    <section className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Top {limit}: {MODES[mode].title}</h2>
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
          {(Object.keys(MODES) as Mode[]).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`rounded-md px-3 py-1 text-sm ${m === mode ? "bg-surface font-medium shadow-sm" : "text-muted"}`}>
              {MODES[m].label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-muted">
        {MODES[mode].description} · {caption} · ohne gehaltene Werte
      </p>
      {isClient ? <Inner picks={result[mode]} limit={limit} /> : <List picks={result[mode].slice(0, limit)} />}
      <p className="text-[11px] text-muted">Schein-Profil aus Black-Scholes mit der 60-Tage-Volatilität – Modellrechnung, keine Anlageberatung.</p>
    </section>
  );
}

function Inner({ picks, limit }: { picks: StrategyPick[]; limit: number }) {
  const { positions, now } = useOsData();
  const held = new Set(positions.filter((p) => p.status === "open").map((p) => p.symbol));
  return <List picks={picks.filter((p) => !held.has(p.symbol)).slice(0, limit)} now={now} />;
}

function List({ picks, now }: { picks: StrategyPick[]; now?: number }) {
  const n = (v: number, d = 0) => v.toLocaleString("de-DE", { maximumFractionDigits: d });
  return (
    <>
      {picks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-5 text-center text-sm text-muted">Aktuell erfüllt keine Aktie die Kriterien.</p>
      ) : (
        <ol className="space-y-2">
          {picks.map((p, i) => {
            const soon = now != null && p.earningsDate != null && p.earningsDate >= now && p.earningsDate - now <= 10 * DAY;
            return (
              <li key={p.symbol} className="rounded-xl border border-border bg-surface p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/stock/${encodeURIComponent(p.symbol)}`} className="min-w-0">
                    <div className="truncate font-medium">
                      <span className="text-muted">{i + 1}.</span> {p.name} <span className="font-mono text-xs text-muted">{p.symbol}</span>
                    </div>
                    <div className="text-xs text-muted tabular-nums">
                      {n(p.price, 2)} {p.currency}
                      {p.changePercent != null && <span className={p.changePercent >= 0 ? " text-up" : " text-down"}> {fmtPct(p.changePercent)}</span>}
                      {p.marketCapEur != null && ` · ${n(p.marketCapEur / 1e9)} Mrd. €`}
                    </div>
                  </Link>
                  <ScoreBadge score={p.score} />
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.reasons.map((r) => (
                    <span key={r} className="rounded-full bg-background px-2 py-0.5 text-[11px] text-muted ring-1 ring-inset ring-border">{r}</span>
                  ))}
                  {soon && <span className="rounded-full bg-neutral/15 px-2 py-0.5 text-[11px] text-neutral">Zahlen {new Date(p.earningsDate!).toLocaleDateString("de-DE")} – danach kaufen</span>}
                </div>
                {p.profile && (
                  <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-background/70 px-2.5 py-1.5 text-xs">
                    <span className="min-w-0 tabular-nums">
                      <span className="font-medium">Call</span> · Basis ≈ {n(p.profile.strike)} {p.currency} · {p.profile.months} Mon. · Omega ≈ {n(p.profile.omega, 1)}
                      {p.profile.priceEur != null && ` · ≈ ${fmtEur(p.profile.priceEur)} (BV 0,1)`}
                      {!p.profile.withinRules && <span className="text-neutral"> · Basis {">"} 1,5 × Kurs</span>}
                    </span>
                    <Link href={`/strategie#finder-${encodeURIComponent(p.symbol)}`} className="shrink-0 text-accent hover:underline">Scheine →</Link>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </>
  );
}
