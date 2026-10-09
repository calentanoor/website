"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { runPortfolio, setupStats, RULES, STRATEGIES, type ExitReason, type PortfolioSettings, type StrategyId, type Trade } from "@/lib/strategy";
import { useStored } from "@/lib/storage";
import { formatNumber, formatPercent } from "@/lib/format";
import { EquityChart } from "@/components/EquityChart";

type Info = Record<string, { name: string; currency: string }>;
type IndexResult = { trades: Trade[]; info: Info; errors: string[] } | { error: string };
type Benchmark = { symbol: string; name: string; returnPct: number; yearly: { year: number; returnPct: number }[] };

const IDS = Object.keys(STRATEGIES) as StrategyId[];
const REASON: Record<ExitReason, string> = { target: "Ziel", stop: "Stopp", trail: "Trailing", signal: "Signal", time: "Zeit", open: "offen" };
const fmtDate = (s?: number) => (s ? new Date(s * 1000).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "–");
const pctClass = (v?: number) => (v == null ? "" : v > 0 ? "text-up" : v < 0 ? "text-down" : "");
// Start of the current day, so that today's signals (bought at the next open) are included
const todayStart = () => Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);

type Settings = Omit<PortfolioSettings, "from">;
const DEFAULT_SETTINGS: Settings = { startCapital: 10000, positionPct: 10, costPct: 1, instrument: "warrant" };

export function StrategyLab({ indices }: { indices: { id: string; name: string }[] }) {
  const [results, setResults] = useState<Record<string, IndexResult>>({});
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [strategy, setStrategy] = useStored<StrategyId>("strategyId", "momentum");
  const [tab, setTab] = useState<"backtest" | "portfolio">("backtest");
  const [stored, setSettings] = useStored<Settings>("strategySettings.v2", DEFAULT_SETTINGS);
  const settings = useMemo(() => ({ ...DEFAULT_SETTINGS, ...stored }), [stored]);
  const [portfolioStart, setPortfolioStart] = useStored<number | null>("portfolioStart", null);
  const [shown, setShown] = useState(30);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/strategy?benchmarks=1")
      .then((r) => r.json())
      .then((b) => !cancelled && setBenchmarks(b.benchmarks ?? []))
      .catch(() => {});
    for (const id of IDS) {
      for (const i of indices) {
        const key = `${id}|${i.id}`;
        fetch(`/api/strategy?index=${i.id}&strategy=${id}`)
          .then(async (res) => {
            const body = await res.json();
            if (!res.ok) throw new Error(body.error ?? res.statusText);
            if (!cancelled) setResults((r) => ({ ...r, [key]: body }));
          })
          .catch((e) => !cancelled && setResults((r) => ({ ...r, [key]: { error: e instanceof Error ? e.message : String(e) } })));
      }
    }
    return () => {
      cancelled = true;
    };
  }, [indices]);

  // Per strategy: merged trades (a symbol in several indices counted once)
  const merged = useMemo(() => {
    const out = {} as Record<StrategyId, { trades: Trade[]; info: Info; errors: string[]; loaded: number }>;
    for (const id of IDS) {
      const seen = new Set<string>();
      const entry = { trades: [] as Trade[], info: {} as Info, errors: [] as string[], loaded: 0 };
      for (const i of indices) {
        const r = results[`${id}|${i.id}`];
        if (!r) continue;
        entry.loaded++;
        if ("error" in r) {
          entry.errors.push(`${i.name}: ${r.error}`);
          continue;
        }
        Object.assign(entry.info, r.info);
        entry.errors.push(...r.errors);
        for (const t of r.trades) {
          const k = `${t.symbol}|${t.entryTime}`;
          if (!seen.has(k)) {
            seen.add(k);
            entry.trades.push(t);
          }
        }
      }
      out[id] = entry;
    }
    return out;
  }, [results, indices]);

  const from = tab === "portfolio" ? portfolioStart ?? undefined : undefined;
  const comparison = useMemo(
    () => IDS.map((id) => ({ id, done: merged[id].loaded === indices.length, result: runPortfolio(merged[id].trades, { ...settings, from }) })),
    [merged, settings, from, indices.length],
  );
  const current = comparison.find((c) => c.id === strategy)!;
  const result = current.result;
  const data = merged[strategy];
  const stats = useMemo(() => setupStats(data.trades), [data.trades]);
  const loadedAll = Object.keys(results).length;
  const total = IDS.length * indices.length;
  const years = [...new Set([...result.yearly.map((y) => y.year), ...benchmarks.flatMap((b) => b.yearly.map((y) => y.year))])].sort();

  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...DEFAULT_SETTINGS, ...s, ...patch }));
  const input = "w-24 rounded-md border border-border bg-background px-2 py-1.5 text-sm tabular-nums";
  const seg = (active: boolean) => `rounded-md px-3 py-1.5 text-sm ${active ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`;

  return (
    <div className="space-y-4">
      {loadedAll < total && (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-muted shadow-sm">
          <div className="mb-2 flex items-center gap-2">
            <div className="size-4 animate-spin rounded-full border-2 border-border border-t-accent" />
            Spiele 5 Jahre für alle Strategien durch … {loadedAll} von {total} Paketen. Der erste Aufruf kann einige Minuten dauern, danach ist alles gecacht.
          </div>
          <div className="h-1.5 rounded-full bg-border/70">
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(loadedAll / total) * 100}%` }} />
          </div>
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-medium">Strategievergleich {tab === "portfolio" ? "(seit Start des Testportfolios)" : `(${RULES.testYears} Jahre)`}</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
            <label className="flex items-center gap-2">
              Startkapital
              <input type="number" value={settings.startCapital} onChange={(e) => update({ startCapital: Math.max(100, Number(e.target.value)) })} className={input} />
            </label>
            <label className="flex items-center gap-2" title="Anteil am aktuellen Depotwert je neuer Position">
              Position %
              <input type="number" value={settings.positionPct} onChange={(e) => update({ positionPct: Math.min(100, Math.max(1, Number(e.target.value))) })} className={`${input} w-16`} />
            </label>
            <label className="flex items-center gap-2" title="Kosten je Kauf bzw. Verkauf (Spread, Gebühren); jedes Rollen zählt doppelt">
              Kosten %
              <input type="number" step="0.1" value={settings.costPct} onChange={(e) => update({ costPct: Math.max(0, Number(e.target.value)) })} className={`${input} w-16`} />
            </label>
            <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
              {(["warrant", "stock"] as const).map((k) => (
                <button key={k} onClick={() => update({ instrument: k })} className={seg(settings.instrument === k)}>
                  {k === "warrant" ? "Optionsschein" : "Aktie"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wide text-muted">
              <tr className="border-b border-border">
                {["Strategie", "Rendite", "p. a.", "Max. Drawdown", "Trefferquote", "Trades", "Endwert"].map((h, i) => (
                  <th key={h} className={`whitespace-nowrap px-2 py-2 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 tabular-nums">
              {comparison.map(({ id, done, result: r }) => (
                <tr key={id} onClick={() => setStrategy(() => id)} className={`cursor-pointer hover:bg-accent/[0.04] ${id === strategy ? "bg-accent/[0.07]" : ""}`}>
                  <td className="px-2 py-2">
                    <span className={id === strategy ? "font-medium text-accent" : ""}>{STRATEGIES[id].name}</span>
                    {!done && <span className="ml-2 text-xs text-muted">lädt …</span>}
                  </td>
                  <td className={`px-2 py-2 text-right font-medium ${pctClass(r.returnPct)}`}>{formatPercent(r.returnPct, 1)}</td>
                  <td className={`px-2 py-2 text-right ${pctClass(r.cagrPct)}`}>{formatPercent(r.cagrPct, 1)}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(r.maxDrawdownPct, 1)} %</td>
                  <td className="px-2 py-2 text-right">{r.winRate != null ? `${formatNumber(r.winRate, 0)} %` : "–"}</td>
                  <td className="px-2 py-2 text-right">{r.closed + r.open}</td>
                  <td className="px-2 py-2 text-right">{formatNumber(r.final, 0)} €</td>
                </tr>
              ))}
              {tab === "backtest" &&
                benchmarks.map((b) => (
                  <tr key={b.symbol} className="text-muted">
                    <td className="px-2 py-2">Vergleich: {b.name} (Kaufen und Halten)</td>
                    <td className={`px-2 py-2 text-right ${pctClass(b.returnPct)}`}>{formatPercent(b.returnPct, 1)}</td>
                    <td className="px-2 py-2 text-right">{formatPercent(((1 + b.returnPct / 100) ** (1 / RULES.testYears) - 1) * 100, 1)}</td>
                    <td colSpan={4} />
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">Zeile anklicken, um die Strategie unten im Detail zu sehen.</p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 text-sm shadow-sm">
        <h2 className="font-medium">{STRATEGIES[strategy].name}</h2>
        <p className="mt-1 text-muted">{STRATEGIES[strategy].description}</p>
        <p className="mt-2 text-xs text-muted">
          Für alle Strategien: höchstens {RULES.maxPositions} Positionen gleichzeitig und {RULES.picksPerDay} neue pro Tag (die stärksten Signale zuerst), Einstieg
          zur nächsten Eröffnung, Trailing-Stop {RULES.trailAtr} ATR, Haltedauer höchstens {RULES.maxHoldDays} Handelstage. Optionsscheine am Geld mit 6 Monaten
          Laufzeit, gerollt sobald weniger als 3 Monate Restlaufzeit bleiben.
        </p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
          <button onClick={() => setTab("backtest")} className={seg(tab === "backtest")}>Backtest ({RULES.testYears} Jahre)</button>
          <button onClick={() => setTab("portfolio")} className={seg(tab === "portfolio")}>Testportfolio</button>
        </div>
        {tab === "portfolio" && (
          <div className="flex flex-1 flex-wrap items-center gap-3 text-sm">
            {portfolioStart ? (
              <>
                <span>
                  Läuft seit <span className="font-medium">{fmtDate(portfolioStart)}</span> – neue Signale werden automatisch übernommen.
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
                <span className="text-muted">Setzt ab dem Startdatum jedes Signal der gewählten Strategie nach denselben Regeln um.</span>
                <button onClick={() => setPortfolioStart(todayStart)} className="ml-auto rounded-md bg-accent px-3 py-1.5 font-medium text-white">
                  Heute starten
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {data.errors.length > 0 && (
        <details className="rounded-lg border border-down/30 bg-down/5 px-4 py-2 text-xs text-down">
          <summary>{data.errors.length} Werte ohne Daten</summary>
          {data.errors.slice(0, 50).map((e) => <div key={e}>{e}</div>)}
        </details>
      )}

      {(tab === "backtest" || portfolioStart) && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
            <Kpi label="Depotwert" value={`${formatNumber(result.final, 0)} €`} />
            <Kpi label="Rendite" value={formatPercent(result.returnPct, 1)} tone={pctClass(result.returnPct)} />
            <Kpi label="Rendite p. a." value={formatPercent(result.cagrPct, 1)} tone={pctClass(result.cagrPct)} />
            <Kpi label="Max. Drawdown" value={`${formatNumber(result.maxDrawdownPct, 1)} %`} />
            <Kpi label="Trefferquote" value={result.winRate != null ? `${formatNumber(result.winRate, 0)} %` : "–"} />
            <Kpi label="Trades (offen)" value={`${result.closed} (${result.open})`} />
            <Kpi label="Signale ohne freien Platz" value={String(result.skipped)} />
          </div>

          <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h2 className="mb-2 font-medium">Depotentwicklung (realisiert)</h2>
            <EquityChart points={result.equity} base={settings.startCapital} />
          </section>

          {tab === "backtest" && (
            <div className="grid gap-4 xl:grid-cols-[1fr_1.6fr]">
              <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                <h2 className="mb-3 font-medium">Jahresrenditen</h2>
                <table className="w-full text-sm tabular-nums">
                  <thead className="text-[11px] uppercase tracking-wide text-muted">
                    <tr className="border-b border-border">
                      <th className="px-2 py-2 text-left font-medium">Jahr</th>
                      <th className="px-2 py-2 text-right font-medium">Strategie</th>
                      {benchmarks.map((b) => (
                        <th key={b.symbol} className="px-2 py-2 text-right font-medium">{b.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {years.map((y) => {
                      const r = result.yearly.find((x) => x.year === y)?.returnPct;
                      return (
                        <tr key={y}>
                          <td className="px-2 py-1.5">{y}</td>
                          <td className={`px-2 py-1.5 text-right font-medium ${pctClass(r)}`}>{formatPercent(r, 1)}</td>
                          {benchmarks.map((b) => {
                            const v = b.yearly.find((x) => x.year === y)?.returnPct;
                            return <td key={b.symbol} className={`px-2 py-1.5 text-right ${pctClass(v)}`}>{formatPercent(v, 1)}</td>;
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-2 text-xs text-muted">Erstes und letztes Jahr nur anteilig.</p>
              </section>

              <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
                <h2 className="mb-1 font-medium">Auswertung nach Setup</h2>
                <p className="mb-3 text-xs text-muted">Alle Signale der Strategie (auch die ohne freien Platz im Depot), vor Kosten.</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm tabular-nums">
                    <thead className="text-[11px] uppercase tracking-wide text-muted">
                      <tr className="border-b border-border">
                        {["Setup", "Typ", "Signale", "Treffer", "Ø Aktie", "Ø OS", "Ø Tage", "Ziel", "Stopp"].map((h, i) => (
                          <th key={h} className={`whitespace-nowrap px-2 py-2 font-medium ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {stats.map((s) => (
                        <tr key={`${s.pattern}-${s.direction}`}>
                          <td className="px-2 py-1.5">{s.pattern}</td>
                          <td className={`px-2 py-1.5 ${s.direction === "bullish" ? "text-up" : "text-down"}`}>{s.direction === "bullish" ? "Call" : "Put"}</td>
                          <td className="px-2 py-1.5 text-right">{s.count}</td>
                          <td className="px-2 py-1.5 text-right">{formatNumber(s.winRate, 0)} %</td>
                          <td className={`px-2 py-1.5 text-right ${pctClass(s.avgReturn)}`}>{formatPercent(s.avgReturn, 2)}</td>
                          <td className={`px-2 py-1.5 text-right ${pctClass(s.avgWarrant)}`}>{formatPercent(s.avgWarrant, 1)}</td>
                          <td className="px-2 py-1.5 text-right">{formatNumber(s.avgDays, 0)}</td>
                          <td className="px-2 py-1.5 text-right">{formatNumber(s.targetRate, 0)} %</td>
                          <td className="px-2 py-1.5 text-right">{formatNumber(s.stopRate, 0)} %</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {stats.length === 0 && <p className="py-6 text-center text-sm text-muted">Noch keine Daten.</p>}
                </div>
              </section>
            </div>
          )}

          <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h2 className="mb-3 font-medium">Trades im Depot ({result.trades.length})</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px] text-sm">
                <thead className="text-[11px] uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    {["Einstieg", "Wert", "Typ", "Setup", "Kurs Ein", "Kurs Aus", "Ausstieg", "Tage", "Rollen", "Aktie", "Optionsschein", "Ergebnis"].map((h, i) => (
                      <th key={h} className={`whitespace-nowrap px-2 py-2 font-medium ${i >= 4 ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60 tabular-nums">
                  {[...result.trades].reverse().slice(0, shown).map((t) => (
                    <tr key={`${t.symbol}-${t.entryTime}`}>
                      <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(t.entryTime)}</td>
                      <td className="max-w-56 truncate px-2 py-1.5">
                        <Link href={`/stock/${encodeURIComponent(t.symbol)}`} className="hover:text-accent">{data.info[t.symbol]?.name ?? t.symbol}</Link>
                      </td>
                      <td className={`px-2 py-1.5 font-medium ${t.direction === "bullish" ? "text-up" : "text-down"}`}>{t.direction === "bullish" ? "Call" : "Put"}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-muted">{t.pattern}</td>
                      <td className="px-2 py-1.5 text-right">{formatNumber(t.entryPrice)}</td>
                      <td className="px-2 py-1.5 text-right">{formatNumber(t.exitPrice)}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">{REASON[t.exitReason]}{t.exitTime ? ` ${fmtDate(t.exitTime)}` : ""}</td>
                      <td className="px-2 py-1.5 text-right">{t.days}</td>
                      <td className="px-2 py-1.5 text-right">{t.rolls || ""}</td>
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
            Optionsschein-Renditen sind modelliert (Black-Scholes mit der historischen 60-Tage-Volatilität bei Einstieg); Spread und Emittenten-Aufschlag
            nur über den Kostensatz berücksichtigt. Fundamentaldaten fließen nicht ein, daher kein Blick in die Zukunft. Indexzusammensetzung von heute –
            Werte, die in den letzten 5 Jahren aus den Indizes ausgeschieden sind, fehlen (leicht geschönte Ergebnisse). Keine Garantie für die Zukunft.
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
