import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getIndex } from "@/lib/indices";
import { getStockSafe } from "@/lib/market-data";
import { rate } from "@/lib/rating";
import { roc } from "@/lib/indicators";
import { ScreenerTable, type ScreenerRow } from "@/components/ScreenerTable";

export default function IndexPage({ params }: PageProps<"/index/[id]">) {
  return (
    <Suspense fallback={<p className="text-muted">Lade Index …</p>}>
      <IndexScreener params={params} />
    </Suspense>
  );
}

async function IndexScreener({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const index = getIndex(id);
  if (!index?.constituents) notFound();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">{index.name} – Screener</h1>
        <p className="text-sm text-muted">
          {index.constituents.length} Werte · Fundamental- und Technik-Rating je 0–100, Gesamt = Mittelwert.
          Klick auf eine Spalte sortiert.
        </p>
      </div>
      <Suspense
        fallback={
          <p className="text-muted">
            Lade und bewerte {index.constituents.length} Aktien … Der erste Aufruf kann bis zu einer Minute dauern,
            danach sind die Daten gecacht.
          </p>
        }
      >
        <Rows symbols={index.constituents} />
      </Suspense>
    </div>
  );
}

async function Rows({ symbols }: { symbols: string[] }) {
  await connection();
  const results = await Promise.all(symbols.map(getStockSafe));
  const rows: ScreenerRow[] = results.map((s) => {
    if ("error" in s) return { symbol: s.symbol, name: s.symbol, error: s.error, signals: [] };
    const r = rate(s.fundamentals, s.candles, s.price, s.sector);
    const closes = s.candles.map((c) => c.close);
    return {
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      currency: s.currency,
      price: s.price,
      changePercent: s.changePercent,
      perf1m: roc(closes, 21) * 100,
      forwardPE: s.fundamentals.forwardPE,
      dividendYield: s.fundamentals.dividendYield == null ? undefined : s.fundamentals.dividendYield * 100,
      earningsDate: s.events.earningsDate,
      fundamental: r.fundamental,
      technical: r.technical,
      total: r.total,
      signals: r.signals,
    };
  });
  return <ScreenerTable rows={rows} />;
}
