import Link from "next/link";
import { STATUS_LABEL, type Pattern } from "@/lib/patterns";
import { formatNumber, formatPercent } from "@/lib/format";
import { ScoreBar } from "./ScoreBadge";

const toneClass = {
  bullish: "bg-up/10 text-up ring-up/25",
  bearish: "bg-down/10 text-down ring-down/25",
  neutral: "bg-accent/10 text-accent ring-accent/25",
};
const directionLabel = { bullish: "bullisch", bearish: "bärisch", neutral: "neutral" };

export function PatternCard({ pattern: p, price, optionsSymbol }: { pattern: Pattern; price: number; optionsSymbol?: string }) {
  const potential = p.target ? (p.target / price - 1) * 100 : undefined;
  return (
    <article className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">{p.label}</h3>
        <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ring-inset ${toneClass[p.direction]}`}>{directionLabel[p.direction]}</span>
        <span className="rounded-full px-2 py-0.5 text-xs text-muted ring-1 ring-inset ring-border">{STATUS_LABEL[p.status]}</span>
      </div>
      <p className="text-sm text-muted">{p.description}</p>
      <dl className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-muted">{p.status === "forming" ? "Auslöser" : "Ausbruchsniveau"}</dt>
          <dd className="tabular-nums">{formatNumber(p.trigger)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Kursziel</dt>
          <dd className="tabular-nums">
            {formatNumber(p.target)}
            {potential != null && <span className={`ml-1 text-xs ${potential >= 0 ? "text-up" : "text-down"}`}>({formatPercent(potential, 1)})</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Stopp</dt>
          <dd className="tabular-nums">{formatNumber(p.stop)}</dd>
        </div>
      </dl>
      <div>
        <div className="mb-1 flex justify-between text-xs text-muted">
          <span>Konfidenz</span>
          <span>{p.confidence}</span>
        </div>
        <ScoreBar score={p.confidence} />
      </div>
      {p.idea && (
        <div className="mt-auto rounded-lg bg-background/70 p-3 text-sm">
          <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-muted">Optionsidee</div>
          <div className="font-medium">{p.idea.strategy}</div>
          <div className="tabular-nums">{p.idea.legs}</div>
          <div className="mt-1 text-xs text-muted">{p.idea.rationale}</div>
          {optionsSymbol && (
            <Link href={`/optionen/${encodeURIComponent(optionsSymbol)}`} className="mt-2 inline-block text-xs text-accent hover:underline">
              Optionskette &amp; erwartete Spanne prüfen →
            </Link>
          )}
        </div>
      )}
    </article>
  );
}
