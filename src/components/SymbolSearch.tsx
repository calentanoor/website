"use client";

import { useEffect, useState } from "react";

type Result = { symbol: string; name: string; exchange?: string; type?: string };

// Search field with Yahoo symbol lookup; calls onSelect with the chosen ticker.
export function SymbolSearch({ onSelect, placeholder = "Aktie suchen (Name oder Ticker)" }: { onSelect: (symbol: string) => void; placeholder?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => r.json())
        .then((body) => setResults(body.results ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const select = (symbol: string) => {
    onSelect(symbol.toUpperCase());
    setQuery("");
    setResults([]);
    setOpen(false);
  };

  const shown = query.trim().length >= 2 ? results : [];

  return (
    <div className="relative w-full max-w-md">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && query.trim()) select(shown[0]?.symbol ?? query.trim());
        }}
        placeholder={placeholder}
        className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none focus:border-accent"
      />
      {open && shown.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface text-sm shadow-lg">
          {shown.map((r) => (
            <li key={r.symbol}>
              <button type="button" onMouseDown={() => select(r.symbol)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent/5">
                <span className="truncate">{r.name}</span>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {r.symbol}
                  {r.exchange ? ` · ${r.exchange}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
