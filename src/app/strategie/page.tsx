import { INDICES } from "@/lib/indices";
import { RULES } from "@/lib/strategy";
import { StrategyLab } from "./StrategyLab";

export default function StrategyPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Strategie-Test</p>
        <h1 className="text-2xl font-semibold tracking-tight">Top-{RULES.picksPerDay}-Strategie</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Jeden Tag werden die {RULES.picksPerDay} stärksten Signale umgesetzt: Einstieg zur nächsten Eröffnung, Ausstieg bei Kursziel oder Stopp,
          spätestens nach {RULES.maxHoldDays} Handelstagen. Der Backtest spielt die Regeln auf den letzten 12 Monaten durch; das Testportfolio
          wendet sie ab deinem Startdatum an.
        </p>
      </div>
      <StrategyLab indices={INDICES.filter((i) => i.constituents).map((i) => ({ id: i.id, name: i.name }))} />
    </div>
  );
}
