import { WatchlistView } from "./WatchlistView";

export default function WatchlistPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Persönlich</p>
        <h1 className="text-2xl font-semibold tracking-tight">Watchlist</h1>
        <p className="mt-1 text-sm text-muted">
          Werte über die Suche hinzufügen oder in jeder Tabelle per Stern markieren. Die Watchlist wird in diesem Browser gespeichert.
        </p>
      </div>
      <WatchlistView />
    </div>
  );
}
