import type { Signal } from "@/lib/rating";

const toneClass = {
  bullish: "border-up/40 text-up",
  bearish: "border-down/40 text-down",
  neutral: "border-neutral/40 text-neutral",
};

export function SignalList({ signals, compact }: { signals: Signal[]; compact?: boolean }) {
  if (!signals.length) return compact ? null : <p className="text-sm text-muted">Keine aktuellen Signale.</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {signals.map((s) => (
        <span key={s.label} className={`rounded border px-1.5 py-0.5 text-xs ${toneClass[s.tone]}`}>
          {s.label}
        </span>
      ))}
    </div>
  );
}
