import type { Level } from "@/lib/os/ladder";

const COLORS: Record<Level["key"], string> = {
  avg: "var(--muted)",
  breakeven: "var(--muted)",
  target: "var(--up)",
  add: "var(--neutral)",
  stop: "var(--down)",
  current: "var(--accent)",
};

const short = (v: number) => v.toLocaleString("de-DE", { maximumFractionDigits: v < 10 ? 2 : 1 });

// Horizontal scale with average, target, add, stop and the current price.
export function LadderBar({ levels }: { levels: Level[] }) {
  if (levels.length < 2) return null;
  const prices = levels.map((l) => l.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = (hi - lo) * 0.08 || hi * 0.05;
  const x = (p: number) => ((p - (lo - pad)) / (hi - lo + 2 * pad)) * 100;
  const current = levels.find((l) => l.key === "current");
  const marks = levels.filter((l) => l.key !== "current").sort((a, b) => a.price - b.price);

  const anchor = marks.find((m) => m.key === "avg" || m.key === "breakeven")?.price ?? current?.price;
  // keep labels inside the card: near the edges align them to the edge instead of centring
  const labelStyle = (p: number): React.CSSProperties => {
    const pos = x(p);
    if (pos < 15) return { left: 0 };
    if (pos > 85) return { right: 0 };
    return { left: `${pos}%`, transform: "translateX(-50%)" };
  };

  return (
    <div className="relative mt-1 h-[74px] select-none" aria-label="Leiter">
      {/* labels of the levels, alternating in two rows above the scale */}
      {marks.map((l, i) => (
        <div key={`label-${l.key}`} className={`absolute whitespace-nowrap text-center text-[10px] leading-tight ${i % 2 ? "top-[18px]" : "top-0"}`} style={{ ...labelStyle(l.price), color: COLORS[l.key] }}>
          {l.label} <span className="tabular-nums">{short(l.price)}</span>
        </div>
      ))}
      <div className="absolute inset-x-0 top-[44px] h-1.5 rounded-full bg-border/80" />
      {current && anchor != null && (
        <div className="absolute top-[44px] h-1.5 rounded-full bg-accent/30" style={{ left: `${Math.min(x(current.price), x(anchor))}%`, width: `${Math.abs(x(current.price) - x(anchor))}%` }} />
      )}
      {marks.map((l) => (
        <div key={l.key} className="absolute top-[36px] h-[22px] w-0.5 -translate-x-1/2 rounded" style={{ left: `${x(l.price)}%`, background: COLORS[l.key] }} />
      ))}
      {current && (
        <>
          <div className="absolute top-[39px] size-4 -translate-x-1/2 rounded-full border-2 border-surface bg-accent shadow" style={{ left: `${x(current.price)}%` }} />
          <div className="absolute top-[60px] whitespace-nowrap text-[10px] font-medium text-accent" style={labelStyle(current.price)}>
            Aktuell {short(current.price)}
          </div>
        </>
      )}
    </div>
  );
}
