import { OsApp } from "./ui/OsApp";

export default function StrategyPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Strategie</p>
        <h1 className="text-2xl font-semibold tracking-tight">Optionsschein-Strategie</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Call-Optionsscheine mit langer Laufzeit und Omega 2,5–3: Gewinnziel +20 % auf den Einstand, Nachkauf-Leiter x · x · 2x, bei 4x Ausstieg bei ±0.
          Pro Position der nächste Schritt und der aktuell beste Schein.
        </p>
      </div>
      <OsApp />
    </div>
  );
}
