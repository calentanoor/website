import { INDICES } from "@/lib/indices";
import { PatternScanner } from "./PatternScanner";

export default function PatternsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-accent">Scanner</p>
        <h1 className="text-2xl font-semibold tracking-tight">Chartformationen</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Automatisch erkannte Formationen auf Tagesbasis: Doppelboden/-top, (inverse) Schulter-Kopf-Schulter, Dreiecke, Keile, Trendkanäle,
          Flaggen und Ausbrüche aus Unterstützung/Widerstand – mit Kursziel, Stopp und passender Optionsstrategie.
        </p>
      </div>
      <PatternScanner indices={INDICES.filter((i) => i.constituents).map((i) => ({ id: i.id, name: i.name }))} />
    </div>
  );
}
