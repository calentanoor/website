import Link from "next/link";
import type { Pick } from "@/lib/strategy-data";
import { RULES, STRATEGIES } from "@/lib/strategy";
import { formatNumber, formatPercent } from "@/lib/format";
import { ScoreBadge } from "./ScoreBadge";
import { WatchStar } from "./WatchStar";

export function TopPicks({ picks, candidates }: { picks: Pick[]; candidates: number }) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Top {RULES.picksPerDay} heute</h2>
          <p className="text-sm text-muted">
            Strategie „{picks[0] ? STRATEGIES[picks[0].strategy].name : STRATEGIES.momentum.name}“ – {candidates} Signal{candidates === 1 ? "" : "e"} im gesamten Universum.
          </p>
        </div>
        <Link href="/strategie" className="text-sm text-accent hover:underline">Backtest &amp; Testportfolio →</Link>
      </div>
      {picks.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">Heute erfüllt kein Wert alle Kriterien.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {picks.map((p, i) => {
            const long = p.direction === "bullish";
            const w = p.warrant;
            return (
              <article key={p.symbol} className="flex flex-col gap-2.5 rounded-xl border border-border bg-surface p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-xs text-muted">#{i + 1}</div>
                    <div className="flex items-center gap-1.5">
                      <WatchStar symbol={p.symbol} />
                      <Link href={`/stock/${encodeURIComponent(p.symbol)}#formationen`} className="truncate font-medium hover:text-accent">{p.name}</Link>
                    </div>
                    <div className="font-mono text-[11px] text-muted">{p.symbol}</div>
                  </div>
                  <span className={`shrink-0 rounded-md px-2 py-1 text-sm font-semibold ${long ? "bg-up/12 text-up" : "bg-down/12 text-down"}`}>{long ? "Call" : "Put"}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted">{p.pattern}</span>
                  <ScoreBadge score={p.score} />
                </div>
                <dl className="grid grid-cols-3 gap-1 text-xs">
                  <div>
                    <dt className="text-muted">Kurs</dt>
                    <dd className="tabular-nums">{formatNumber(p.price)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Ziel</dt>
                    <dd className="tabular-nums text-up">{p.target ? formatPercent(Math.abs(p.target / p.price - 1) * 100, 1) : "Trailing"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Stopp</dt>
                    <dd className="tabular-nums text-down">{formatPercent(-Math.abs(p.stop / p.price - 1) * 100, 1)}</dd>
                  </div>
                </dl>
                <div className="mt-auto rounded-lg bg-background/70 p-2.5 text-xs">
                  <div className="font-medium">{w.type}-Optionsschein</div>
                  <div className="tabular-nums text-muted">
                    Basis {formatNumber(w.strike)} · ca. 6 Monate · Hebel ≈ {formatNumber(w.leverage, 1)}
                  </div>
                  <div className="tabular-nums text-muted">Break-even bei Fälligkeit {formatNumber(w.breakEven)}</div>
                </div>
                <div className="text-[11px] text-muted">
                  Stopp {formatNumber(p.stop)}
                  {p.target ? ` · Ziel ${formatNumber(p.target)} · CRV ${formatNumber(p.rewardRisk, 1)}` : " · danach Trailing-Stop"}
                </div>
              </article>
            );
          })}
        </div>
      )}
      <p className="text-xs text-muted">
        Regeln: Einstieg zur Eröffnung des nächsten Handelstags, Stopp im Basiswert und Trailing-Stop ({RULES.trailAtr} ATR), spätestens nach {RULES.maxHoldDays}{" "}
        Handelstagen raus; Optionsschein rollen, sobald weniger als 3 Monate Restlaufzeit bleiben. Höchstens {RULES.maxPositions} Positionen gleichzeitig.
        Signale basieren auf dem aktuellen Kurs und stehen erst nach Börsenschluss endgültig fest. Keine Anlageberatung.
      </p>
    </section>
  );
}
