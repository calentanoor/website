import { INDICES } from "@/lib/indices";
import { CustomScreener } from "./CustomScreener";

export default function ScreenerPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Eigene Ansicht</p>
        <h1 className="text-2xl font-semibold tracking-tight">Screener</h1>
        <p className="mt-1 text-sm text-muted">
          Universum wählen, Kennzahlen-Filter kombinieren und die Ansicht unter einem Namen speichern (in diesem Browser).
        </p>
      </div>
      <CustomScreener indices={INDICES.filter((i) => i.constituents).map((i) => ({ id: i.id, name: i.name }))} />
    </div>
  );
}
