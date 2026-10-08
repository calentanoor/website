"use client";

import { useWatchlist } from "@/lib/storage";

export function WatchStar({ symbol, withLabel }: { symbol: string; withLabel?: boolean }) {
  const { has, toggle } = useWatchlist();
  const active = has(symbol);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        toggle(symbol);
      }}
      title={active ? "Von Watchlist entfernen" : "Zur Watchlist hinzufügen"}
      className={`inline-flex items-center gap-1.5 rounded-md text-sm transition-colors ${
        withLabel ? "border border-border px-3 py-1.5 hover:bg-border/40" : "p-0.5"
      } ${active ? "text-neutral" : "text-muted hover:text-foreground"}`}
    >
      <svg viewBox="0 0 20 20" className="size-4" fill={active ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden>
        <path d="M10 2.5l2.3 4.8 5.2.7-3.8 3.6.9 5.2L10 14.3l-4.6 2.5.9-5.2L2.5 8l5.2-.7z" />
      </svg>
      {withLabel && (active ? "Auf Watchlist" : "Zur Watchlist")}
    </button>
  );
}
