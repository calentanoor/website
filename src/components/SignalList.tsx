import type { Signal } from "@/lib/rating";

const toneClass = {
  bullish: "bg-up/10 text-up ring-up/25",
  bearish: "bg-down/10 text-down ring-down/25",
  neutral: "bg-neutral/10 text-neutral ring-neutral/25",
};

const dotClass = { bullish: "bg-up", bearish: "bg-down", neutral: "bg-neutral" };

function Chip({ signal, compact }: { signal: Signal; compact?: boolean }) {
  return (
    <span
      title={signal.label}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${toneClass[signal.tone]}`}
    >
      <span className={`size-1.5 rounded-full ${dotClass[signal.tone]}`} />
      {compact ? signal.short : signal.label}
    </span>
  );
}

// compact: short labels, at most `max` chips plus a "+n" counter (full text on hover)
export function SignalList({ signals, compact, max = 2 }: { signals: Signal[]; compact?: boolean; max?: number }) {
  if (!signals.length) return compact ? null : <p className="text-sm text-muted">Keine aktuellen Signale.</p>;
  const shown = compact ? signals.slice(0, max) : signals;
  const rest = signals.length - shown.length;
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((s) => (
        <Chip key={s.label} signal={s} compact={compact} />
      ))}
      {rest > 0 && (
        <span
          title={signals.slice(max).map((s) => s.label).join("\n")}
          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs text-muted ring-1 ring-inset ring-border"
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
