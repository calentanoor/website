import Link from "next/link";
import { OptionsSearch } from "./OptionsSearch";

const POPULAR = [
  ["SPY", "S&P 500 ETF"], ["QQQ", "Nasdaq 100 ETF"], ["^SPX", "S&P 500 Index"], ["IWM", "Russell 2000 ETF"],
  ["AAPL", "Apple"], ["NVDA", "Nvidia"], ["MSFT", "Microsoft"], ["TSLA", "Tesla"], ["AMZN", "Amazon"], ["META", "Meta"],
];

export default function OptionsLanding() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Optionen</p>
        <h1 className="text-2xl font-semibold tracking-tight">Optionsanalyse</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Erwartete Kursspanne aus der impliziten Volatilität, Max Pain, Call- und Put-Walls, Gamma-Exposure der Market Maker und
          Laufzeitstruktur. Datenquelle: Yahoo-Optionsketten (nur US-Werte, ca. 15 Min. verzögert).
        </p>
      </div>
      <OptionsSearch />
      <div className="flex flex-wrap gap-2">
        {POPULAR.map(([symbol, name]) => (
          <Link key={symbol} href={`/optionen/${encodeURIComponent(symbol)}`} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-sm hover:border-accent/50">
            <span className="font-mono font-medium">{symbol}</span> <span className="text-muted">{name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
