"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { DEFAULT_SETTINGS, startData } from "@/lib/os/defaults";
import { ACTION_ORDER, evaluatePosition, fmtEur, fmtPct, historyStats, tradeStats, type PositionView } from "@/lib/os/ladder";
import { callFromWarrantEur, impliedVol, yearsBetween } from "@/lib/os/model";
import type { Market } from "@/lib/os/finder";
import type { Candidate, OsStore, Position, Settings, Warrant } from "@/lib/os/types";
import { useStored } from "@/lib/storage";
import { DataPanel, SettingsPanel } from "./SettingsPanel";
import { Finder, rankFor } from "./Finder";
import { PositionCard, TONE } from "./PositionCard";
import { buttonClass, Field, fmtDate, inputClass, nowIso, primaryButtonClass, uid } from "./inputs";

const START = startData();
type Quote = { price?: number; currency?: string; name?: string; sector?: string; earningsDate?: number; error?: string };
type Live = { key: string; eurusd?: number; quotes: Record<string, Quote>; asOf?: string; error?: string };
type Tab = "dashboard" | "finder" | "settings" | "data";

// Positions live in localStorage and the rules depend on the current time,
// so the view only renders in the browser.
export function OsApp() {
  const isClient = useSyncExternalStore(() => () => {}, () => true, () => false);
  return isClient ? <OsAppInner /> : <div className="h-64 animate-pulse rounded-xl bg-border/40" />;
}

function OsAppInner() {
  const [stored, setStore] = useStored<OsStore>("os-strategy.v1", START);
  // fill in settings added later (older stored data or imports)
  const store = useMemo<OsStore>(() => {
    const s = stored.settings ?? DEFAULT_SETTINGS;
    return {
      ...stored,
      positions: stored.positions ?? [],
      candidates: stored.candidates ?? [],
      settings: { ...DEFAULT_SETTINGS, ...s, finder: { ...DEFAULT_SETTINGS.finder, ...s.finder, weights: { ...DEFAULT_SETTINGS.finder.weights, ...s.finder?.weights } } },
    };
  }, [stored]);
  const { settings, positions, candidates } = store;
  const [tab, setTab] = useState<Tab>("dashboard");
  const [finderSymbol, setFinderSymbol] = useState<string | undefined>();
  const [live, setLive] = useState<Live>({ key: "", quotes: {} });
  const [reload, setReload] = useState(0);
  const [now] = useState(() => Date.now());

  const symbols = useMemo(() => [...new Set([...positions.map((p) => p.symbol), ...candidates.map((c) => c.symbol)])].sort(), [positions, candidates]);
  const symbolKey = symbols.join(",");

  // Live share prices, earnings dates and EUR/USD for all symbols (refetched on demand)
  const requestKey = `${symbolKey}|${reload}`;
  useEffect(() => {
    if (!symbolKey) return;
    let cancelled = false;
    fetch(`/api/os-market?symbols=${encodeURIComponent(symbolKey)}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setLive({ key: requestKey, eurusd: d.eurusd, quotes: d.quotes ?? {}, asOf: d.asOf }))
      .catch((e) => !cancelled && setLive((l) => ({ ...l, key: requestKey, error: e instanceof Error ? e.message : String(e) })));
    return () => {
      cancelled = true;
    };
  }, [symbolKey, requestKey]);
  const loading = !!symbolKey && live.key !== requestKey;
  const refresh = () => setReload((n) => n + 1);

  const update = (fn: (s: OsStore) => OsStore) => setStore(() => fn(store));
  const setPositions = (fn: (p: Position[]) => Position[]) => update((s) => ({ ...s, positions: fn(s.positions) }));
  const setCandidates = (fn: (c: Candidate[]) => Candidate[]) => update((s) => ({ ...s, candidates: fn(s.candidates) }));
  const setSettings = (next: Settings) => update((s) => ({ ...s, settings: next }));

  const eurusd = settings.eurusdManual ?? live.eurusd;
  const stockPriceOf = useCallback(
    (symbol: string, p?: Position) => p?.stockPrice ?? live.quotes[symbol]?.price ?? positions.find((x) => x.symbol === symbol && x.stockPrice)?.stockPrice,
    [live.quotes, positions],
  );
  const earningsOf = useCallback(
    (symbol: string, p?: Position) => {
      const manual = p?.earningsDate ?? positions.find((x) => x.symbol === symbol && x.earningsDate)?.earningsDate;
      return manual ? new Date(manual).getTime() : live.quotes[symbol]?.earningsDate;
    },
    [live.quotes, positions],
  );
  const marketFor = useCallback((symbol: string): Market => ({ stockPrice: stockPriceOf(symbol), eurusd, now, earningsDate: earningsOf(symbol) }), [stockPriceOf, eurusd, now, earningsOf]);

  const open = positions.filter((p) => p.status === "open");
  const views = useMemo(() => {
    const investedOf = (p: Position) => p.buys.reduce((a, b) => a + b.amount, 0);
    const bySector = new Map<string, number>();
    const stage3 = new Map<string, number>();
    for (const p of open) {
      bySector.set(p.sector, (bySector.get(p.sector) ?? 0) + investedOf(p));
      if (p.buys.length >= 3) stage3.set(p.sector, (stage3.get(p.sector) ?? 0) + 1);
    }
    return positions.map((p) => {
      const S = stockPriceOf(p.symbol, p);
      const iv = (w: Warrant) => {
        if (!S || !eurusd || !w.bid) return undefined;
        const T = yearsBetween(now, new Date(w.expiry).getTime());
        return T > 0 ? impliedVol(callFromWarrantEur(w.bid, w.ratio, eurusd), { S, K: w.strike, T, r: settings.rate, q: settings.dividendYield }) : undefined;
      };
      return evaluatePosition(p, { settings, now, stockPrice: S, earningsDate: earningsOf(p.symbol, p), sectorInvested: bySector.get(p.sector) ?? 0, sectorStage3: stage3.get(p.sector) ?? 0, impliedVol: iv });
    });
  }, [positions, open, settings, now, stockPriceOf, earningsOf, eurusd]);

  const best = useMemo(() => {
    const m = new Map<string, ReturnType<typeof rankFor>[number]>();
    for (const s of symbols) {
      const b = rankFor(s, candidates, marketFor(s), settings).find((v) => v.best);
      if (b) m.set(s, b);
    }
    return m;
  }, [symbols, candidates, marketFor, settings]);

  const openViews = views.filter((v) => v.position.status === "open");
  const closedViews = views.filter((v) => v.position.status === "closed");
  const todo = openViews.filter((v) => v.action.tone !== "white").sort((a, b) => ACTION_ORDER[a.action.tone] - ACTION_ORDER[b.action.tone]);
  const sortedOpen = [...openViews].sort((a, b) => ACTION_ORDER[a.action.tone] - ACTION_ORDER[b.action.tone]);

  // Merge another position of the same share into `targetId` (warrants, buys, sales)
  const merge = (targetId: string, sourceId: string) =>
    setPositions((ps) => {
      const target = ps.find((x) => x.id === targetId);
      const source = ps.find((x) => x.id === sourceId);
      if (!target || !source) return ps;
      const merged: Position = {
        ...target,
        warrants: [...target.warrants, ...source.warrants.filter((w) => !target.warrants.some((t) => t.id === w.id))],
        buys: [...target.buys, ...source.buys],
        sells: [...(target.sells ?? []), ...(source.sells ?? [])],
        note: [target.note, source.note].filter(Boolean).join(" · ") || undefined,
      };
      return ps.filter((x) => x.id !== sourceId).map((x) => (x.id === targetId ? merged : x));
    });
  const mergeTargetsFor = (p: Position) =>
    positions
      .filter((x) => x.id !== p.id && x.symbol === p.symbol)
      .map((x) => ({ id: x.id, label: `${x.status === "open" ? "offen" : `geschlossen ${fmtDate(x.closedDate)}`} · ${x.warrants.map((w) => w.wkn || "ohne WKN").join(", ")}` }));
  const cardProps = (v: PositionView) => ({
    view: v,
    settings,
    stockPrice: stockPriceOf(v.position.symbol, v.position),
    stockPriceSource: v.position.stockPrice ? "manuell" : live.quotes[v.position.symbol]?.price ? "live" : undefined,
    earningsDate: earningsOf(v.position.symbol, v.position),
    best: v.position.status === "open" ? best.get(v.position.symbol) : undefined,
    onChange: (p: Position) => setPositions((ps) => ps.map((x) => (x.id === p.id ? p : x))),
    onDelete: () => setPositions((ps) => ps.filter((x) => x.id !== v.position.id)),
    onOpenFinder: openFinder,
    mergeTargets: mergeTargetsFor(v.position),
    onMerge: (otherId: string) => merge(v.position.id, otherId),
  });

  const openFinder = (symbol: string) => {
    setFinderSymbol(symbol);
    setTab("finder");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const adopt = (c: Candidate) => {
    const w: Warrant = { id: uid(), wkn: c.wkn, issuer: c.issuer, strike: c.strike, expiry: c.expiry, ratio: c.ratio, bid: c.bid, bidAsOf: c.asOf, iv: c.iv };
    const target = positions.find((p) => p.symbol === c.symbol && p.status === "open");
    if (target) setPositions((ps) => ps.map((p) => (p.id === target.id ? { ...p, warrants: p.warrants.some((x) => x.wkn && x.wkn === c.wkn) ? p.warrants : [...p.warrants, w] } : p)));
    else setPositions((ps) => [...ps, { id: uid(), symbol: c.symbol, name: live.quotes[c.symbol]?.name, sector: Object.keys(settings.sectorBudgets)[0] ?? "Ohne Sektor", status: "open", warrants: [w], buys: [] }]);
    setTab("dashboard");
  };

  const tabs: [Tab, string][] = [["dashboard", "Positionen"], ["finder", "Schein-Finder"], ["settings", "Einstellungen"], ["data", "Daten"]];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-x-auto rounded-lg border border-border bg-background p-0.5">
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${tab === k ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          EUR/USD {eurusd ? eurusd.toLocaleString("de-DE", { maximumFractionDigits: 4 }) : "–"}
          {settings.eurusdManual ? " (manuell)" : ""}
          {live.asOf && ` · Kurse ${new Date(live.asOf).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })}`}
          <button onClick={refresh} disabled={loading} className={buttonClass}>{loading ? "lädt …" : "Aktualisieren"}</button>
          {live.error && <span className="text-down">Kurse nicht verfügbar</span>}
        </div>
      </div>

      {tab === "dashboard" && (
        <>
          <Overview views={openViews} settings={settings} />
          <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
            <h2 className="mb-2 font-medium">Was ist heute zu tun</h2>
            {todo.length === 0 ? (
              <p className="text-sm text-muted">Nichts zu tun – alle Positionen halten.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {todo.map((v) => (
                  <li key={v.position.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <a href={`#pos-${v.position.id}`} className="flex items-center gap-2 font-medium hover:text-accent">
                      <span className={`size-2.5 rounded-full ${TONE[v.action.tone].dot}`} />
                      {v.position.symbol}: {v.action.title}
                    </a>
                    <span className="text-xs text-muted">{v.action.detail}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            {sortedOpen.map((v) => (
              <PositionCard key={v.position.id} {...cardProps(v)} />
            ))}
          </div>
          <NewPosition sectors={Object.keys(settings.sectorBudgets)} openSymbols={open.map((p) => p.symbol)} onCreate={(p) => setPositions((ps) => [...ps, p])} />

          {closedViews.length > 0 && <History views={closedViews} cardProps={cardProps} />}
        </>
      )}

      {tab === "finder" && (
        <Finder
          symbols={[...new Set(open.map((p) => p.symbol))]}
          symbol={finderSymbol ?? open[0]?.symbol ?? symbols[0] ?? "NVDA"}
          onSymbol={setFinderSymbol}
          candidates={candidates}
          settings={settings}
          marketFor={marketFor}
          onCandidates={setCandidates}
          onAdopt={adopt}
        />
      )}
      {tab === "settings" && <SettingsPanel settings={settings} onChange={setSettings} />}
      {tab === "data" && <DataPanel store={store} onReplace={(s) => setStore(() => s)} />}

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted">
        <span>Modellrechnung, keine Anlageberatung. Werte mit „Modell“ sind Black-Scholes-Schätzungen; Datenblatt-Werte haben Vorrang.</span>
        <Link href="/strategie/backtest" className="hover:text-foreground">Alter Strategie-Backtest →</Link>
      </footer>
    </div>
  );
}

function Overview({ views, settings }: { views: PositionView[]; settings: Settings }) {
  const invested = views.reduce((a, v) => a + v.invested, 0);
  const valued = views.filter((v) => v.value != null);
  const value = valued.reduce((a, v) => a + v.value!, 0);
  const valuedInvested = valued.reduce((a, v) => a + v.invested, 0);
  const pl = valuedInvested ? (value / valuedInvested - 1) * 100 : undefined;
  const sectors = new Map<string, number>();
  for (const v of views) sectors.set(v.position.sector, (sectors.get(v.position.sector) ?? 0) + v.invested);
  const stages = [1, 2, 3].map((k) => views.filter((v) => v.stage === k).length);
  const card = "rounded-xl border border-border bg-surface px-4 py-3 shadow-sm";
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className={card}>
        <div className="text-xl font-semibold tabular-nums">{fmtEur(invested)}</div>
        <div className="text-xs text-muted">investiert ({(invested / settings.x).toLocaleString("de-DE", { maximumFractionDigits: 1 })}x à {fmtEur(settings.x)})</div>
      </div>
      <div className={card}>
        <div className={`text-xl font-semibold tabular-nums ${pl == null ? "" : pl >= 0 ? "text-up" : "text-down"}`}>
          {pl == null ? "–" : `${fmtPct(pl)} · ${fmtEur(value - valuedInvested)}`}
        </div>
        <div className="text-xs text-muted">Gewinn/Verlust {valued.length < views.length ? `(${valued.length} von ${views.length} mit Kurs)` : ""}</div>
      </div>
      <div className={card}>
        <div className="text-xl font-semibold tabular-nums">{stages[0]} · {stages[1]} · {stages[2]}</div>
        <div className="text-xs text-muted">Positionen in Stufe 1x · 2x · 4x</div>
      </div>
      <div className={`${card} space-y-1.5`}>
        {[...sectors].map(([sector, amount]) => {
          const budget = settings.sectorBudgets[sector];
          const share = budget ? Math.min(100, (amount / budget) * 100) : 0;
          return (
            <div key={sector}>
              <div className="flex justify-between text-xs">
                <span>{sector}</span>
                <span className="tabular-nums">{fmtEur(amount)}{budget ? ` / ${fmtEur(budget)}` : ""}</span>
              </div>
              {budget ? (
                <div className="h-1.5 rounded-full bg-border/70">
                  <div className={`h-full rounded-full ${amount > budget ? "bg-down" : share > 80 ? "bg-neutral" : "bg-up"}`} style={{ width: `${share}%` }} />
                </div>
              ) : null}
            </div>
          );
        })}
        {!sectors.size && <div className="text-xs text-muted">Keine offenen Positionen</div>}
      </div>
    </div>
  );
}

function History({ views, cardProps }: { views: PositionView[]; cardProps: (v: PositionView) => React.ComponentProps<typeof PositionCard> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const h = historyStats(views.map((v) => v.position));
  const rows = views
    .map((v) => ({ v, t: tradeStats(v.position) }))
    .sort((a, b) => (b.t.lastSell ?? "").localeCompare(a.t.lastSell ?? ""));
  const card = "rounded-lg bg-background/70 px-3 py-2";
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h2 className="font-medium">Historie (geschlossene Trades)</h2>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        <div className={card}><div className="font-semibold tabular-nums">{h.trades}</div><div className="text-xs text-muted">Trades mit Ergebnis</div></div>
        <div className={card}><div className="font-semibold tabular-nums">{h.winRate != null ? `${Math.round(h.winRate)} %` : "–"}</div><div className="text-xs text-muted">Trefferquote</div></div>
        <div className={card}><div className={`font-semibold tabular-nums ${h.pl >= 0 ? "text-up" : "text-down"}`}>{fmtEur(h.pl)}</div><div className="text-xs text-muted">Gewinn/Verlust gesamt</div></div>
        <div className={card}><div className={`font-semibold tabular-nums ${(h.avgReturn ?? 0) >= 0 ? "text-up" : "text-down"}`}>{fmtPct(h.avgReturn)}</div><div className="text-xs text-muted">Ø Rendite je Trade</div></div>
        <div className={card}><div className="font-semibold tabular-nums">{h.avgDays != null ? `${Math.round(h.avgDays)} Tage` : "–"}</div><div className="text-xs text-muted">Ø Haltedauer</div></div>
      </div>
      <ul className="divide-y divide-border/60 text-sm">
        {rows.map(({ v, t }) => (
          <li key={v.position.id} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-medium">{v.position.name ?? v.position.symbol}</span>
                <span className="text-muted"> · {v.position.warrants.map((w) => w.wkn || "ohne WKN").join(", ")} · {fmtDate(t.firstBuy)} – {fmtDate(t.lastSell)}{t.days != null ? ` (${t.days} Tage)` : ""}</span>
              </span>
              <span className="flex items-center gap-3 tabular-nums">
                {t.fullySold ? (
                  <>
                    {fmtEur(t.invested)} → {fmtEur(t.proceeds)}
                    <span className={t.returnPct! >= 0 ? "text-up" : "text-down"}>{fmtPct(t.returnPct)}</span>
                  </>
                ) : (
                  <span className="text-xs text-neutral">{t.invested ? "Verkäufe nachtragen" : "Käufe und Verkäufe nachtragen"}</span>
                )}
                <button onClick={() => setOpenId(openId === v.position.id ? null : v.position.id)} className="text-xs text-accent hover:underline">
                  {openId === v.position.id ? "zuklappen" : "Details"}
                </button>
              </span>
            </div>
            {openId === v.position.id && (
              <div className="mt-2">
                <PositionCard {...cardProps(v)} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewPosition({ sectors, openSymbols, onCreate }: { sectors: string[]; openSymbols: string[]; onCreate: (p: Position) => void }) {
  const [open, setOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [sector, setSector] = useState(sectors[0] ?? "");
  if (!open) return <button onClick={() => setOpen(true)} className={buttonClass}>+ Neue Position</button>;
  return (
    <div className="grid gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm sm:grid-cols-4">
      <Field label="Ticker (Yahoo, z. B. NVDA)"><input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className={inputClass} /></Field>
      <Field label="Sektor">
        <input list="os-sectors" value={sector} onChange={(e) => setSector(e.target.value)} className={inputClass} />
        <datalist id="os-sectors">{sectors.map((s) => <option key={s} value={s} />)}</datalist>
      </Field>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
        {openSymbols.includes(symbol) && (
          <p className="w-full text-xs text-neutral">
            Für {symbol} gibt es schon eine offene Position. Neue Scheine dort über „Schein hinzufügen“ ergänzen – dann gilt ±0 über alle Käufe zusammen.
          </p>
        )}
        <button
          disabled={!symbol}
          onClick={() => {
            onCreate({ id: uid(), symbol, sector: sector || "Ohne Sektor", status: "open", warrants: [], buys: [], note: `angelegt ${nowIso().slice(0, 10)}` });
            setSymbol("");
            setOpen(false);
          }}
          className={primaryButtonClass}
        >
          Anlegen
        </button>
        <button onClick={() => setOpen(false)} className={buttonClass}>Abbrechen</button>
      </div>
    </div>
  );
}
