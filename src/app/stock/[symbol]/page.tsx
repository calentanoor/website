import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getStock } from "@/lib/market-data";
import { rate, type Category } from "@/lib/rating";
import { changeColor, formatBig, formatDate, formatNumber, formatPercent } from "@/lib/format";
import { ScoreBadge, ScoreBar } from "@/components/ScoreBadge";
import { SignalList } from "@/components/SignalList";
import { PriceChart } from "@/components/PriceChart";
import { WatchStar } from "@/components/WatchStar";
import { PatternCard } from "@/components/PatternCard";
import { detectPatterns } from "@/lib/patterns";

export default function StockPage({ params }: PageProps<"/stock/[symbol]">) {
  return (
    <Suspense fallback={<p className="text-muted">Lade Aktie …</p>}>
      <StockDetail params={params} />
    </Suspense>
  );
}

async function StockDetail({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  await connection();

  let stock;
  try {
    stock = await getStock(symbol);
  } catch (e) {
    return (
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">{symbol}</h1>
        <p className="text-down">Keine Daten verfügbar: {e instanceof Error ? e.message : String(e)}</p>
      </div>
    );
  }

  const rating = rate(stock.fundamentals, stock.candles, stock.price, stock.sector);
  const { patterns, levels } = detectPatterns(stock.candles);
  const hasOptions = !stock.symbol.includes(".");
  const f = stock.fundamentals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold">{stock.name}</h1>
            <WatchStar symbol={stock.symbol} withLabel />
            {hasOptions && (
              <Link href={`/optionen/${encodeURIComponent(stock.symbol)}`} className="rounded-md border border-border px-3 py-1.5 text-sm text-muted hover:bg-border/40 hover:text-foreground">
                Optionsanalyse →
              </Link>
            )}
          </div>
          <p className="text-sm text-muted">
            {stock.symbol}
            {stock.sector ? ` · ${stock.sector}` : ""}
            {stock.industry ? ` · ${stock.industry}` : ""}
          </p>
          <p className="mt-1 text-xl">
            {formatNumber(stock.price)} {stock.currency}{" "}
            <span className={`text-base ${changeColor(stock.changePercent)}`}>{formatPercent(stock.changePercent)}</span>
          </p>
        </div>
        <div className="flex gap-6">
          {[
            ["Fundamental", rating.fundamental],
            ["Technik", rating.technical],
            ["Gesamt", rating.total],
          ].map(([label, score]) => (
            <div key={label as string} className="text-center">
              <div className="mb-1 text-xs text-muted">{label}</div>
              <ScoreBadge score={score as number | undefined} large />
            </div>
          ))}
        </div>
      </div>

      <section className="rounded-xl border border-border bg-surface shadow-sm p-4">
        <h2 className="mb-3 font-medium">Chart</h2>
        <PriceChart symbol={stock.symbol} initial={stock.candles} patterns={patterns} levels={levels} />
        <div className="mt-3">
          <SignalList signals={rating.signals} />
        </div>
      </section>

      <section id="formationen" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold">Chartformationen</h2>
          {levels.length > 0 && (
            <p className="text-sm text-muted">
              Unterstützungen:{" "}
              {levels.filter((l) => l.kind === "support").slice(0, 3).map((l) => `${formatNumber(l.price)} (×${l.touches})`).join(", ") || "–"} · Widerstände:{" "}
              {levels.filter((l) => l.kind === "resistance").slice(0, 3).map((l) => `${formatNumber(l.price)} (×${l.touches})`).join(", ") || "–"}
            </p>
          )}
        </div>
        {patterns.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">Aktuell keine klare Formation erkannt.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {patterns.map((p) => (
              <PatternCard key={p.id} pattern={p} price={stock.price} optionsSymbol={hasOptions ? stock.symbol : undefined} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <CategoryPanel title="Fundamentalanalyse" score={rating.fundamental} categories={rating.fundamentalCategories} />
        <CategoryPanel title="Technische Analyse" score={rating.technical} categories={rating.technicalCategories} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface shadow-sm p-4">
          <h2 className="mb-3 font-medium">Kennzahlen</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <KeyValue label="Marktkapitalisierung" value={formatBig(stock.marketCap)} />
            <KeyValue label="KGV (trailing)" value={formatNumber(f.trailingPE, 1)} />
            <KeyValue label="KGV (erwartet)" value={formatNumber(f.forwardPE, 1)} />
            <KeyValue label="KBV" value={formatNumber(f.priceToBook, 2)} />
            <KeyValue label="Dividendenrendite" value={f.dividendYield ? `${formatNumber(f.dividendYield * 100, 2)} %` : "–"} />
            <KeyValue label="Analysten" value={f.numberOfAnalystOpinions ? `${f.numberOfAnalystOpinions}` : "–"} />
            <KeyValue label="Kursziel (Ø)" value={f.targetMeanPrice ? `${formatNumber(f.targetMeanPrice)} ${stock.currency}` : "–"} />
          </dl>
        </section>
        <section className="rounded-xl border border-border bg-surface shadow-sm p-4">
          <h2 className="mb-3 font-medium">Termine</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <KeyValue label="Nächste Quartalszahlen" value={formatDate(stock.events.earningsDate)} />
            <KeyValue label="Ex-Dividende" value={formatDate(stock.events.exDividendDate)} />
            <KeyValue label="Dividendenzahlung" value={formatDate(stock.events.dividendDate)} />
          </dl>
        </section>
      </div>
    </div>
  );
}

function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </>
  );
}

function CategoryPanel({ title, score, categories }: { title: string; score?: number; categories: Category[] }) {
  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">{title}</h2>
        <ScoreBadge score={score} />
      </div>
      <div className="space-y-4">
        {categories.map((cat) => (
          <div key={cat.key}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium">{cat.label}</span>
              <span className="text-muted">{cat.score ?? "–"}</span>
            </div>
            <ScoreBar score={cat.score} />
            <table className="mt-2 w-full text-xs">
              <tbody>
                {cat.criteria.map((c) => (
                  <tr key={c.label}>
                    <td className="py-0.5 text-muted">{c.label}</td>
                    <td className="py-0.5 text-right">{c.display}</td>
                    <td className="w-10 py-0.5 text-right">{c.score ?? "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
