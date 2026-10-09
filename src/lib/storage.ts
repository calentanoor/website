"use client";

// Per-browser persistence (localStorage) for watchlist and saved views, exposed
// as React hooks via useSyncExternalStore so all components stay in sync.
import { useCallback, useSyncExternalStore } from "react";

const listeners = new Set<() => void>();
const cache = new Map<string, { raw: string | null; value: unknown }>();

function read<T>(key: string, fallback: T): T {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {}
  const hit = cache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  let value: T = fallback;
  try {
    if (raw) value = JSON.parse(raw) as T;
  } catch {}
  cache.set(key, { raw, value });
  return value;
}

function write<T>(key: string, value: T) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = () => listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useStored<T>(key: string, fallback: T) {
  const value = useSyncExternalStore(
    subscribe,
    () => read(key, fallback),
    () => fallback,
  );
  const set = useCallback((update: (prev: T) => T) => write(key, update(read(key, fallback))), [key, fallback]);
  return [value, set] as const;
}

const EMPTY: string[] = [];

export function useWatchlist() {
  const [list, setList] = useStored<string[]>("watchlist", EMPTY);
  const has = useCallback((symbol: string) => list.includes(symbol), [list]);
  const toggle = useCallback(
    (symbol: string) => setList((l) => (l.includes(symbol) ? l.filter((s) => s !== symbol) : [...l, symbol])),
    [setList],
  );
  const add = useCallback((symbol: string) => setList((l) => (l.includes(symbol) ? l : [...l, symbol])), [setList]);
  return { list, has, toggle, add };
}

export type FilterRule = { field: string; min?: number; max?: number };

export type SavedView = {
  id: string;
  name: string;
  universe: string[]; // index ids and/or "watchlist"
  rules: FilterRule[];
  sectors: string[];
  signal: "all" | "bullish" | "bearish";
};

const NO_VIEWS: SavedView[] = [];

export function useSavedViews() {
  return useStored<SavedView[]>("views", NO_VIEWS);
}
