import { Suspense } from "react";
import { connection } from "next/server";
import { getCentralBankEvents, getCompanyEvents, getExpiryEvents, getMacroEvents } from "@/lib/calendar";
import { INDICES } from "@/lib/indices";
import { CalendarView } from "./CalendarView";

// Only called after connection(), so the value is per request.
const requestTime = () => Date.now();

export default function CalendarPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Termine</p>
        <h1 className="text-2xl font-semibold tracking-tight">Wirtschaftskalender</h1>
        <p className="mt-1 text-sm text-muted">
          Konjunkturdaten, Notenbanksitzungen, Optionsverfälle sowie Quartalszahlen und Dividenden aller Indexwerte.
        </p>
      </div>
      <Suspense
        fallback={
          <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted shadow-sm">
            <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
            Lade Termine …
          </div>
        }
      >
        <Events />
      </Suspense>
    </div>
  );
}

async function Events() {
  await connection();
  const now = requestTime();
  const [macro, company] = await Promise.all([getMacroEvents(), getCompanyEvents()]);
  const events = [...macro.events, ...getCentralBankEvents(), ...getExpiryEvents(now), ...company.events]
    .filter((e) => e.time >= now - 7 * 86400000)
    .sort((a, b) => a.time - b.time);
  return (
    <CalendarView
      events={events}
      now={now}
      errors={[...macro.errors.map((e) => `Konjunkturdaten: ${e}`), ...company.errors.map((e) => `Unternehmenstermine: ${e}`)]}
      indices={INDICES.filter((i) => i.constituents).map((i) => ({ id: i.id, name: i.name }))}
    />
  );
}
