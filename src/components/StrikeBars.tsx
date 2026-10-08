// Bars per strike: `up` values above the axis, `down` values below (both drawn
// by magnitude), with a marker for the current spot price.
import { formatBig, formatNumber } from "@/lib/format";

type Datum = { strike: number; up: number; down: number };

export function StrikeBars({
  data,
  spot,
  upLabel,
  downLabel,
  upClass = "fill-up",
  downClass = "fill-down",
  markers = [],
  height = 220,
}: {
  data: Datum[];
  spot: number;
  upLabel: string;
  downLabel: string;
  upClass?: string;
  downClass?: string;
  markers?: { value: number; label: string; className: string }[];
  height?: number;
}) {
  if (!data.length) return <p className="text-sm text-muted">Keine Daten.</p>;
  const width = 900;
  const pad = { l: 8, r: 8, t: 14, b: 26 };
  const max = Math.max(1, ...data.map((d) => Math.max(Math.abs(d.up), Math.abs(d.down))));
  const lo = data[0].strike;
  const hi = data[data.length - 1].strike;
  const x = (k: number) => pad.l + ((k - lo) / (hi - lo || 1)) * (width - pad.l - pad.r);
  const mid = pad.t + (height - pad.t - pad.b) / 2;
  const h = (v: number) => (Math.abs(v) / max) * ((height - pad.t - pad.b) / 2);
  const bw = Math.max(1.5, ((width - pad.l - pad.r) / data.length) * 0.7);
  const ticks = data.filter((_, i) => i % Math.ceil(data.length / 10) === 0);

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img">
        <line x1={pad.l} x2={width - pad.r} y1={mid} y2={mid} className="stroke-border" />
        {data.map((d) => (
          <g key={d.strike}>
            <title>{`Strike ${formatNumber(d.strike)}: ${upLabel} ${formatBig(Math.abs(d.up))}, ${downLabel} ${formatBig(Math.abs(d.down))}`}</title>
            <rect x={x(d.strike) - bw / 2} y={mid - h(d.up)} width={bw} height={h(d.up)} className={upClass} opacity={0.85} />
            <rect x={x(d.strike) - bw / 2} y={mid} width={bw} height={h(d.down)} className={downClass} opacity={0.85} />
          </g>
        ))}
        {[{ value: spot, label: "Kurs", className: "stroke-foreground" }, ...markers].map((m) =>
          m.value >= lo && m.value <= hi ? (
            <g key={m.label}>
              <line x1={x(m.value)} x2={x(m.value)} y1={pad.t - 4} y2={height - pad.b} className={m.className} strokeDasharray="4 3" />
              <text x={x(m.value) + 3} y={pad.t + 4} className="fill-muted text-[11px]">{m.label}</text>
            </g>
          ) : null,
        )}
        {ticks.map((d) => (
          <text key={d.strike} x={x(d.strike)} y={height - 8} textAnchor="middle" className="fill-muted text-[11px]">
            {formatNumber(d.strike, d.strike < 100 ? 1 : 0)}
          </text>
        ))}
      </svg>
      <div className="mt-1 flex gap-4 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${upClass.replace("fill-", "bg-")}`} />{upLabel}</span>
        <span className="flex items-center gap-1.5"><span className={`size-2.5 rounded-sm ${downClass.replace("fill-", "bg-")}`} />{downLabel}</span>
      </div>
    </div>
  );
}
