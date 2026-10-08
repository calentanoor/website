import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { INDICES, type IndexDef } from "@/lib/indices";
import { getIndexQuote } from "@/lib/market-data";
import { rateTechnicals } from "@/lib/rating";
import { roc } from "@/lib/indicators";
import { changeColor, formatNumber, formatPercent } from "@/lib/format";
import { ScoreBadge } from "@/components/ScoreBadge";
import { Sparkline } from "@/components/Sparkline";
import { SignalList } from "@/components/SignalList";

export default function Home() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Indizes</h1>
        <p className="mt-1 text-sm text-muted">
          Technisches Rating je Index (0–100). Für Indizes mit hinterlegten Mitgliedern führt ein Klick zum Screener.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {INDICES.map((index) => (
          <Suspense key={index.id} fallback={<CardShell index={index} />}>
            <IndexCard index={index} />
          </Suspense>
        ))}
      </div>
    </div>
  );
}

function CardShell({ index, children }: { index: IndexDef; children?: React.ReactNode }) {
  const body = (
    <div className="h-full rounded-xl border border-border bg-surface shadow-sm p-4 flex flex-col transition hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md">
      <div className="flex items-baseline justify-between">
        <h2 className="font-medium">{index.name}</h2>
        <span className="rounded-full bg-border/60 px-2 py-0.5 text-[11px] text-muted">{index.region}</span>
      </div>
      {children ?? <div className="mt-4 h-28 animate-pulse rounded bg-border/50" />}
    </div>
  );
  return index.constituents ? <Link href={`/index/${index.id}`}>{body}</Link> : body;
}

async function IndexCard({ index }: { index: IndexDef }) {
  await connection();
  let quote;
  try {
    quote = await getIndexQuote(index.symbol);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`getIndexQuote(${index.symbol}) failed:`, message);
    return (
      <CardShell index={index}>
        <p className="mt-4 text-sm text-down">Daten nicht verfügbar.</p>
        <p className="mt-1 line-clamp-3 text-xs text-muted">{message}</p>
      </CardShell>
    );
  }
  const closes = quote.candles.map((c) => c.close);
  const { categories, signals } = rateTechnicals(quote.candles);
  const scores = categories.map((c) => c.score).filter((s): s is number => s != null);
  const techScore = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : undefined;
  const yearStart = quote.candles.findIndex((c) => new Date(c.time * 1000).getFullYear() === new Date().getFullYear());
  const ytd = yearStart > 0 ? quote.price / quote.candles[yearStart - 1].close - 1 : undefined;

  return (
    <CardShell index={index}>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div>
          <div className="text-xl font-semibold">{formatNumber(quote.price)}</div>
          <div className={`text-sm ${changeColor(quote.changePercent)}`}>{formatPercent(quote.changePercent)}</div>
        </div>
        <Sparkline values={closes.slice(-126)} width={120} height={36} />
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-muted">1 Monat</dt>
          <dd className={changeColor(roc(closes, 21))}>{formatPercent(roc(closes, 21) * 100, 1)}</dd>
        </div>
        <div>
          <dt className="text-muted">YTD</dt>
          <dd className={changeColor(ytd)}>{formatPercent(ytd == null ? undefined : ytd * 100, 1)}</dd>
        </div>
        <div>
          <dt className="text-muted">Technik</dt>
          <dd>
            <ScoreBadge score={techScore} />
          </dd>
        </div>
      </dl>
      <div className="mt-auto pt-3">
        <SignalList signals={signals} compact max={3} />
      </div>
    </CardShell>
  );
}
