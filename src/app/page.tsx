import { Suspense } from "react";
import { connection } from "next/server";
import { getStrategyPicks } from "@/lib/os/picks";
import { MyPositions } from "@/components/home/MyPositions";
import { StrategyPicks } from "@/components/home/StrategyPicks";
import { IndexStrip } from "@/components/home/IndexStrip";

export default function Home() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <MyPositions />
        <Suspense fallback={<Loading text="Suche die passenden Aktien …" />}>
          <Picks />
        </Suspense>
      </div>
      <Suspense fallback={<div className="h-24 animate-pulse rounded-xl bg-border/40" />}>
        <IndexStrip />
      </Suspense>
    </div>
  );
}

async function Picks() {
  await connection();
  const { picks, candidates } = await getStrategyPicks(10);
  return <StrategyPicks picks={picks} candidates={candidates} />;
}

function Loading({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted shadow-sm">
      <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
      {text}
    </div>
  );
}
