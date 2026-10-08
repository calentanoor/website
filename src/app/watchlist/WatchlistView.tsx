"use client";

import { useWatchlist } from "@/lib/storage";
import { useRows } from "@/lib/use-rows";
import { ScreenerTable } from "@/components/ScreenerTable";
import { SymbolSearch } from "@/components/SymbolSearch";

const NO_INDICES: string[] = [];

export function WatchlistView() {
  const { list, add } = useWatchlist();
  const { rows, error, loading } = useRows(NO_INDICES, list);

  return (
    <div className="space-y-4">
      <SymbolSearch onSelect={add} placeholder="Aktie zur Watchlist hinzufügen …" />
      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">
          Noch keine Werte auf der Watchlist.
        </div>
      ) : error ? (
        <p className="text-sm text-down">Fehler beim Laden: {error}</p>
      ) : loading || !rows ? (
        <p className="text-sm text-muted">Lade {list.length} Werte …</p>
      ) : (
        <ScreenerTable rows={rows} showStats={false} />
      )}
    </div>
  );
}
