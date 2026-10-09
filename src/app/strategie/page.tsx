import { INDICES } from "@/lib/indices";
import { DEFAULT_PARAMS, RULES } from "@/lib/strategy";
import { StrategyLab } from "./StrategyLab";

export default function StrategyPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Strategie-Test</p>
        <h1 className="text-2xl font-semibold tracking-tight">Backtest &amp; Testportfolio</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Drei regelbasierte Strategien im Vergleich über {RULES.testYears} Jahre auf allen Indexwerten: höchstens {RULES.maxPositions} Positionen gleichzeitig,
          Haltedauer bis {DEFAULT_PARAMS.maxHoldDays} Handelstage, Optionsscheine mit mindestens 3 Monaten Restlaufzeit. Das Testportfolio wendet die gewählte
          Strategie ab deinem Startdatum an.
        </p>
      </div>
      <StrategyLab indices={INDICES.filter((i) => i.constituents).map((i) => ({ id: i.id, name: i.name }))} />
    </div>
  );
}
