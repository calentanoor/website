"use client";

// Shared state of the warrant strategy for the strategy page and the home
// page: stored positions (localStorage), live quotes and evaluated positions.
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEFAULT_SETTINGS, startData } from "./defaults";
import { evaluatePosition } from "./ladder";
import { callFromWarrantEur, impliedVol, yearsBetween } from "./model";
import type { Market } from "./finder";
import type { Candidate, OsStore, Position, Settings, Warrant } from "./types";
import { useStored } from "../storage";

const START = startData();
export type Quote = { price?: number; changePercent?: number; currency?: string; name?: string; sector?: string; earningsDate?: number; error?: string };
export type Live = { key: string; eurusd?: number; quotes: Record<string, Quote>; asOf?: string; error?: string };

export function useOsData() {
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


  return { store, setStore, settings, positions, candidates, live, loading, refresh, eurusd, stockPriceOf, earningsOf, marketFor, views, open, now, symbols, update, setPositions, setCandidates, setSettings };
}

// Set the current bid of a warrant (with time stamp)
export function withBid(p: Position, warrantId: string, bid: number | undefined): Position {
  return { ...p, warrants: p.warrants.map((w) => (w.id === warrantId ? { ...w, bid, bidAsOf: new Date().toISOString() } : w)) };
}

export type { Candidate, Settings };
