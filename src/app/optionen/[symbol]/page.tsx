import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { getOptionsAnalysis } from "@/lib/options-data";
import { OptionsDashboard } from "../OptionsDashboard";

// Only called after connection(), so the value is per request.
const requestTime = () => Date.now();

export default function OptionsPage({ params }: PageProps<"/optionen/[symbol]">) {
  return (
    <Suspense
      fallback={
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted shadow-sm">
          <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          Lade Optionsketten …
        </div>
      }
    >
      <Analysis params={params} />
    </Suspense>
  );
}

async function Analysis({ params }: { params: Promise<{ symbol: string }> }) {
  const symbol = decodeURIComponent((await params).symbol).toUpperCase();
  await connection();
  let analysis;
  try {
    analysis = await getOptionsAnalysis(symbol, requestTime());
  } catch (e) {
    return (
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">Optionen {symbol}</h1>
        <p className="text-down">{e instanceof Error ? e.message : String(e)}</p>
        <p className="text-sm text-muted">
          Yahoo liefert Optionsketten nur für US-Werte (Aktien, ETFs, Indizes wie ^SPX). Für deutsche Aktien gibt es dort keine Optionsdaten.{" "}
          <Link href="/optionen" className="text-accent hover:underline">Anderen Wert wählen</Link>
        </p>
      </div>
    );
  }
  return <OptionsDashboard analysis={analysis} />;
}
