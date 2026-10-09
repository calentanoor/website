"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { patternStats, runPortfolio, RULES, type PortfolioSettings, type Trade } from "@/lib/strategy";
import { useStored } from "@/lib/storage";
import { formatNumber, formatPercent } from "@/lib/format";
import { EquityChart } from "@/components/EquityChart";

type Info = Record<string, { name: string; currency: string }>;
type Loaded = { id: string; trades: Trade[]; info: Info; errors: string[] } | { id: string; error: string };

const REASON = { target: "Ziel", stop: "Stopp", time: "Zeit", open: "offen" };
const fmtDate = (s?: number) => (s ? new Date(s * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–");
// Start of the current day, so that today's signals (bought at the next open) are included
const todayStart = () => Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
const pctClass = (v: number) => (v > 0 ? "text-up" : v < 0 ? "text-down" : "");

const DEFAULT_SETTINGS: Omit<PortfolioSettings, "from"> = { startCapital: 10000, perTrade: 500, instrument: "warrant" };

export function StrategyLab({ indices }: { indices: { id: string; name: string }[] }) {
  const [loaded, setLoaded] = useState<Loaded[]>([]);
  const [tab, setTab] = useState<"backtest" | "portfolio">("backtest");
  const [settings, setSettings] = useStored("strategySettings", DEFAULT_SETTINGS);
  const [portfolioStart, setPortfolioStart] = useStored<number | null>("portfolioStart", null);
  const [shown, setShown] = useState(30);

  useEffect(() => {
    let cancelled = false;
    for (const i of indices) {
      fetch(`/api/strategy?index=${i.id}`)
        .then(async (res) => {
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? res.statusText);
          if (!cancelled) setLoaded((l) => [...l.filter((x) => x.id !== i.id), { id: i.id, ...body }]);
        })
        .catch((e) => !cancelled && setLoaded((l) => [...l.filter((x) => x.id !== i.id), { id: i.id, error: e instanceof Error ? e.message : String(e) }]));
    }
    return () => {
      cancelled = true;
    };
  }, [indices]);

  // Merge indices; a symbol in several indices yields its trades only once.
  const { trades, info, errors } = useMemo(() => {
    const seen = new Set<string>();
    const trades: Trade[] = [];
    const info: Info = {};
    const errors: string[] = [];
    for (const l of loaded) {
      if ("error" in l) {
        errors.push(`${l.id}: ${l.error}`);
        continue;
      }
      Object.assign(info, l.info);
      errors.push(...l.errors);
      for (const t of l.trades) {
        const key = `${t.symbol}|${t.entryTime}`;
        if (!seen.has(key)) {
          seen.add(key);
          trades.push(t);
        }
      }
    }
    return { trades, info, errors };
  }, [loaded]);

  const from = tab === "portfolio" ? portfolioStart ?? undefined : undefined;
  const result = useMemo(() => runPortfolio(trades, { ...settings, from }), [trades, settings, from]);
  const stats = useMemo(() => patternStats(trades), [trades]);
  const done = loaded.length;
  const update = (patch: Partial<typeof settings>) => setSettings((s) => ({ ...s, ...patch }));
  const input = "w-28 rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums";
  const tabClass = (active: boolean) => `rounded-md px-4 py-1.5 text-sm ${active ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
          <button onClick={() => setTab("backtest")} className={tabClass(tab === "backtest")}>Backtest (12 Monate)</button>
          <button onClick={() => setTab("portfolio")} className={tabClass(tab === "portfolio")}>Testportfolio</button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
          <label className="flex items-center gap-2">
            Startkapital
            <input type="number" value={settings.startCapital} onChange={(e) => update({ startCapital: Math.max(100, Number(e.target.value)) })} className={input} />
          </label>
          <label className="flex items-center gap-2">
            Einsatz je Trade
            <input type="number" value={settings.perTrade} onChange={(e) => update({ perTrade: Math.max(10, Number(e.target.value)) })} className={input} />
          </label>
          <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
            {(["warrant", "stock"] as const).map((k) => (
              <button key={k} onClick={() => update({ instrument: k })} className={tabClass(settings.instrument === k)}>
                {k === "warrant" ? "Optionsschein" : "Aktie"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {done < indices.length && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <div className="size-4 animate-spin rounded-full border-2 border-border border-t-accent" />
            Spiele Signale der letzten 12 Monate durch … {done} von {indices.length} Indizes. Der erste Aufruf kann einige Minuten dauern, danach ist alles gecacht.
          </div>
          <div className="h-1.5 rounded-full bg-border/70">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(done / indices.length) * 100}%` }} />
          </div>
        </div>
      )}
      {errors.length > 0 && (
        <details className="rounded-lg border border-down/30 bg-down/5 px-4 py-2 text-xs text-down">
          <summary>{errors.length} Werte ohne Daten</summary>
          {errors.slice(0, 50).map((e) => <div key={e}>{e}</div>)}
        </details>
      )}

      {tab === "portfolio" && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4 text-sm shadow-sm">
          {portfolioStart ? (
            <>
              <span>
                Testportfolio läuft seit <span className="font-medium">{fmtDate(portfolioStart)}</span>. Neue Signale werden automatisch übernommen –
                einfach regelmäßig vorbeischauen.
              </span>
              <button
                onClick={() => confirm("Testportfolio zurücksetzen und heute neu starten?") && setPortfolioStart(todayStart)}
                className="ml-auto rounded-md border border-border px-3 py-1.5 text-muted hover:text-foreground"
              >
                Neu starten
              </button>
            </>
          ) : (
            <>
              <span>Das Testportfolio setzt ab dem Startdatum jedes Top-Signal mit dem gewählten Einsatz um.</span>
              <button onClick={() => setPortfolioStart(todayStart)} className="ml-auto rounded-md bg-accent px-3 py-1.5 font-medium text-white">
                Heute starten
              </button>
            </>
          )}
        </div>
      )}

      {(tab === "backtest" || portfolioStart) && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Depotwert" value={`${formatNumber(result.final, 0)} €`} />
            <Kpi label="Rendite" value={formatPercent(result.returnPct, 1)} tone={pctClass(result.returnPct)} />
            <Kpi label="Max. Drawdown" value={`${formatNumber(result.maxDrawdownPct, 1)} %`} />
            <Kpi label="Trefferquote" value={result.winRate != null ? `${formatNumber(result.winRate, 0)} %` : "–"} />
            <Kpi label="Trades abgeschlossen" value={String(result.closed)} />
            <Kpi label="Positionen offen" value={String(result.open)} />
          </div>

          <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h2 className="mb-2 font-medium">Depotentwicklung</h2>
            <EquityChart points={result.equity} base={settings.startCapital} />
          </section>

          {tab === "backtest" && (
            <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
              <h2 className="mb-1 font-medium">Trefferquote nach Formation</h2>
              <p className="mb-3 text-xs text-muted">Alle Signale der letzten 12 Monate (auch die, die nicht unter die Top {RULES.picksPerDay} kamen); Rendite nach Regel-Ausstieg.</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wide text-muted">
                    <tr className="border-b border-border">
                      {["Formation", "Richtung", "Signale", "Trefferquote", "Ø Aktie", "Ø Optionsschein", "Ziel erreicht", "Stopp"].map((h, i) => (
                        <th key={h} className={`whitespace-nowrap px-2 py-2 font-medium ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60 tabular-nums">
                    {stats.map((s) => (
                      <tr key={`${s.pattern}-${s.direction}`}>
                        <td className="px-2 py-1.5">{s.pattern}</td>
                        <td className={`px-2 py-1.5 ${s.direction === "bullish" ? "text-up" : "text-down"}`}>{s.direction === "bullish" ? "Call" : "Put"}</td>
                        <td className="px-2 py-1.5 text-right">{s.count}</td>
                        <td className="px-2 py-1.5 text-right">{formatNumber(s.winRate, 0)} %</td>
                        <td className={`px-2 py-1.5 text-right ${pctClass(s.avgReturn)}`}>{formatPercent(s.avgReturn, 2)}</td>
                        <td className={`px-2 py-1.5 text-right ${pctClass(s.avgWarrant)}`}>{formatPercent(s.avgWarrant, 1)}</td>
                        <td className="px-2 py-1.5 text-right">{formatNumber(s.targetRate, 0)} %</td>
                        <td className="px-2 py-1.5 text-right">{formatNumber(s.stopRate, 0)} %</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {stats.length === 0 && <p className="py-6 text-center text-sm text-muted">Noch keine Daten.</p>}
              </div>
            </section>
          )}

          <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h2 className="mb-3 font-medium">Trades ({result.trades.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    {["Einstieg", "Wert", "Typ", "Formation", "Kurs Ein", "Kurs Aus", "Ausstieg", "Tage", "Aktie", "Optionsschein", "Ergebnis"].map((h, i) => (
                      <th key={h} className={`whitespace-nowrap px-2 py-2 font-medium ${i >= 4 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 tabular-nums">
                  {[...result.trades].reverse().slice(0, shown).map((t) => (
                    <tr key={`${t.symbol}-${t.entryTime}`}>
                      <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(t.entryTime)}</td>
                      <td className="max-w-56 truncate px-2 py-1.5">
                        <Link href={`/stock/${encodeURIComponent(t.symbol)}`} className="hover:text-accent">{info[t.symbol]?.name ?? t.symbol}</Link>
                      </td>
                      <td className={`px-2 py-1.5 font-medium ${t.direction === "bullish" ? "text-up" : "text-down"}`}>{t.direction === "bullish" ? "Call" : "Put"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">{t.pattern}</td>
                      <td className="px-2 py-1.5 text-right">{formatNumber(t.entryPrice)}</td>
                      <td className="px-2 py-1.5 text-right">{formatNumber(t.exitPrice)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">{REASON[t.exitReason]}{t.exitTime ? ` ${fmtDate(t.exitTime)}` : ""}</td>
                      <td className="px-2 py-1.5 text-right">{t.days}</td>
                      <td className={`px-2 py-1.5 text-right ${pctClass(t.returnPct)}`}>{formatPercent(t.returnPct, 1)}</td>
                      <td className={`px-2 py-1.5 text-right ${pctClass(t.warrantReturnPct)}`}>{formatPercent(Math.max(-100, t.warrantReturnPct), 1)}</td>
                      <td className={`px-2 py-1.5 text-right font-medium ${pctClass(t.pnl)}`}>{formatNumber(t.pnl, 0)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.trades.length > shown && (
                <button onClick={() => setShown((n) => n + 50)} className="mt-3 w-full rounded-md border border-border py-2 text-sm text-muted hover:text-foreground">
                  Weitere {Math.min(50, result.trades.length - shown)} von {result.trades.length - shown} anzeigen
                </button>
              )}
              {result.trades.length === 0 && (
                <p className="py-6 text-center text-sm text-muted">
                  {tab === "portfolio" ? "Noch keine Trades seit dem Start – die ersten Positionen entstehen ab dem nächsten Handelstag." : "Keine Trades."}
                </p>
              )}
            </div>
          </section>

          <p className="text-xs text-muted">
            Optionsschein-Renditen sind modelliert: Call/Put am Geld, 3 Monate Laufzeit, Black-Scholes mit der historischen 60-Tage-Volatilität bei
            Einstieg – ohne Spread und Emittenten-Aufschlag, daher optimistisch. Fundamentaldaten fließen nicht in die Signale ein (keine historischen
            Werte verfügbar), wodurch der Backtest ohne Blick in die Zukunft auskommt. Ergebnisse der Vergangenheit sind keine Garantie.
          </p>
        </>
      )}
    </div>
  );
}

function Kpi({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3 shadow-sm">
      <div className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
