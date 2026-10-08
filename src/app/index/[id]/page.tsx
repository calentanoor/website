import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { getIndex } from "@/lib/indices";
import { buildRows } from "@/lib/screener";
import { ScreenerTable } from "@/components/ScreenerTable";

// Only called after connection(), so the value is per request.
const requestTime = () => Date.now();

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
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Screener · {index.region}</p>
        <h1 className="text-2xl font-semibold tracking-tight">{index.name}</h1>
        <p className="mt-1 text-sm text-muted">
          {index.constituents.length} Werte · Fundamental- und Technik-Rating je 0–100, Gesamt ist der Mittelwert.
          Spaltenköpfe sortieren, Hover über Signale zeigt Details.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted shadow-sm">
            <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
            Lade und bewerte {index.constituents.length} Aktien … Der erste Aufruf kann bis zu einer Minute dauern,
            danach sind die Daten gecacht.
          </div>
        }
      >
        <Rows symbols={index.constituents} />
      </Suspense>
    </div>
  );
}

async function Rows({ symbols }: { symbols: string[] }) {
  await connection();
  return <ScreenerTable rows={await buildRows(symbols)} now={requestTime()} />;
}
