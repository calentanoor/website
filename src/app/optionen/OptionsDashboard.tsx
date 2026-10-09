"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { OptionsAnalysis } from "@/lib/options-data";
import { validIv, type Chain } from "@/lib/options-math";
import { formatBig, formatNumber, formatPercent } from "@/lib/format";
import { StrikeBars } from "@/components/StrikeBars";
import { ExpectedMoveChart, type ConePoint, type Level } from "@/components/ExpectedMoveChart";
import { WatchStar } from "@/components/WatchStar";

const LEVEL_COLORS = { callWall: "#12955f", putWall: "#d23c3c", maxPain: "#c48a12", zeroGamma: "#8b6cf6" };

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });
const pct = (v?: number, digits = 1) => (v == null ? "–" : `${formatNumber(v * 100, digits)} %`);

export function OptionsDashboard({ analysis: a }: { analysis: OptionsAnalysis }) {
  // Default: first expiry at least 5 days out (weeklies expiring today are noisy).
  const defaultIndex = Math.max(0, a.expiries.findIndex((e) => e.dte >= 5));
  const [selected, setSelected] = useState(defaultIndex);
  const expiry = a.expiries[selected];
  const chain = a.chains[selected];

  const reference = a.expiries.find((e) => e.dte >= 20 && e.atmIv != null) ?? a.expiries.find((e) => e.atmIv != null);
  const ivHv = reference?.atmIv && a.realizedVol ? reference.atmIv / a.realizedVol : undefined;
  const totals = a.expiries.reduce((acc, e) => ({ call: acc.call + e.callOi, put: acc.put + e.putOi }), { call: 0, put: 0 });
  const pcr = totals.call ? totals.put / totals.call : undefined;
  const skew = useMemo(() => (reference ? skew25(a.chains[a.expiries.indexOf(reference)], a.spot) : undefined), [a, reference]);

  const [horizon, setHorizon] = useState(90);
  const cone = useMemo(() => buildCone(a, horizon), [a, horizon]);
  const chartCandles = useMemo(() => a.candles.slice(-Math.round(horizon * 1.4)), [a.candles, horizon]);

  const levels = useMemo<Level[]>(() => {
    const l: Level[] = [];
    if (expiry?.callWall) l.push({ price: expiry.callWall, label: "Call-Wall", color: LEVEL_COLORS.callWall });
    if (expiry?.putWall) l.push({ price: expiry.putWall, label: "Put-Wall", color: LEVEL_COLORS.putWall });
    if (expiry?.maxPain) l.push({ price: expiry.maxPain, label: "Max Pain", color: LEVEL_COLORS.maxPain });
    if (a.gex.zeroGamma) l.push({ price: a.gex.zeroGamma, label: "Gamma-Flip", color: LEVEL_COLORS.zeroGamma });
    return l;
  }, [a, expiry]);

  const oiData = useMemo(
    () => strikeTable(chain).filter((r) => nearSpot(r.strike, a.spot)).map((r) => ({ strike: r.strike, up: r.callOi, down: r.putOi })),
    [chain, a.spot],
  );
  const gexData = useMemo(
    () => a.gex.byStrike.filter((s) => nearSpot(s.strike, a.spot)).map((s) => ({ strike: s.strike, up: Math.max(0, s.net), down: Math.min(0, s.net) })),
    [a],
  );

  const positiveGamma = a.gex.total >= 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-accent">Optionsanalyse</p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{a.name}</h1>
            <WatchStar symbol={a.symbol} withLabel />
          </div>
          <p className="text-sm text-muted">
            <span className="font-mono">{a.symbol}</span> · Kurs {formatNumber(a.spot)} {a.currency} ·{" "}
            <Link href={`/stock/${encodeURIComponent(a.symbol)}`} className="text-accent hover:underline">Aktienanalyse</Link>
          </p>
        </div>
        <p className="text-xs text-muted">Zinssatz {pct(a.rate, 2)} · Daten ca. 15 Min. verzögert</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <Stat label={`ATM-IV (${reference ? Math.round(reference.dte) : "–"} T)`} value={pct(reference?.atmIv)} />
        <Stat label="Realisierte Vola (20 T)" value={pct(a.realizedVol)} />
        <Stat label="IV / realisierte Vola" value={ivHv ? formatNumber(ivHv, 2) : "–"} tone={ivHv == null ? "" : ivHv > 1.25 ? "text-down" : ivHv < 0.9 ? "text-up" : ""} hint="> 1,25: Optionen teuer · < 0,9: günstig" />
        <Stat label="Put/Call-Ratio (OI)" value={pcr ? formatNumber(pcr, 2) : "–"} />
        <Stat label="Netto-Gamma (GEX)" value={`${positiveGamma ? "+" : "−"}$${formatBig(Math.abs(a.gex.total))}`} tone={positiveGamma ? "text-up" : "text-down"} hint="$ Gamma je 1 % Kursbewegung" />
        <Stat label="Gamma-Flip" value={a.gex.zeroGamma ? formatNumber(a.gex.zeroGamma) : "–"} hint="Darüber dämpfen Market Maker Bewegungen, darunter verstärken sie" />
        <Stat label="Skew (Put − Call IV)" value={skew != null ? `${formatNumber(skew * 100, 1)} Pkt.` : "–"} hint="IV 90 %-Put minus IV 110 %-Call" />
      </div>

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h2 className="font-medium">Erwarteter Kursverlauf</h2>
            <div className="inline-flex rounded-lg border border-border bg-background p-0.5">
              {[30, 90, 180, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => setHorizon(d)}
                  className={`rounded-md px-2.5 py-0.5 text-xs ${d === horizon ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-foreground"}`}
                >
                  {d === 365 ? "1 J" : `${d} T`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 text-xs text-muted">
            <span className="text-accent">- - 1σ (≈ 68 %)</span>
            <span className="text-accent/60">··· 2σ (≈ 95 %)</span>
            {levels.map((l) => (
              <span key={l.label} style={{ color: l.color }}>··· {l.label}</span>
            ))}
          </div>
        </div>
        <ExpectedMoveChart candles={chartCandles} cone={cone} levels={levels} />
        <p className="mt-2 text-xs text-muted">
          Kegel aus der impliziten ATM-Volatilität der Verfälle (Kurs × IV × √Zeit, zwischen den Verfällen interpoliert). Walls und Max Pain beziehen sich auf den gewählten Verfall,
          der Gamma-Flip auf alle Verfälle der nächsten 60 Tage.
        </p>
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 font-medium">Verfall</h2>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {a.expiries.map((e, i) => (
            <button
              key={e.expiration}
              onClick={() => setSelected(i)}
              className={`rounded-md px-2.5 py-1 text-xs ring-1 ring-inset ${i === selected ? "bg-accent/10 font-medium text-accent ring-accent/40" : "text-muted ring-border hover:text-foreground"}`}
            >
              {fmtDate(e.expiration)} <span className="opacity-70">({Math.round(e.dte)} T)</span>
            </button>
          ))}
        </div>
        {expiry && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
            <KV label="Erwartete Bewegung (IV)" value={expiry.moveIv ? `± ${formatNumber(expiry.moveIv)} (${pct(expiry.moveIv / a.spot)})` : "–"} />
            <KV label="Spanne 1σ" value={expiry.moveIv ? `${formatNumber(a.spot - expiry.moveIv)} – ${formatNumber(a.spot + expiry.moveIv)}` : "–"} />
            <KV label="Straddle (≈ 0,85 × = erw. Bewegung)" value={expiry.straddle ? `${formatNumber(expiry.straddle)} → ± ${formatNumber(expiry.moveStraddle)}` : "–"} />
            <KV label="ATM-IV" value={pct(expiry.atmIv)} />
            <KV label="Max Pain" value={expiry.maxPain ? `${formatNumber(expiry.maxPain)} (${formatPercent((expiry.maxPain / a.spot - 1) * 100, 1)})` : "–"} />
            <KV label="Call-Wall / Put-Wall" value={`${formatNumber(expiry.callWall)} / ${formatNumber(expiry.putWall)}`} />
            <KV label="Put/Call-Ratio OI / Volumen" value={`${formatNumber(expiry.pcrOi, 2)} / ${formatNumber(expiry.pcrVolume, 2)}`} />
            <KV label="Open Interest Calls / Puts" value={`${formatBig(expiry.callOi)} / ${formatBig(expiry.putOi)}`} />
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-1 font-medium">Open Interest nach Strike</h2>
          <p className="mb-3 text-xs text-muted">Gewählter Verfall, ±15 % um den Kurs. Große Balken wirken oft als Widerstand (Calls) bzw. Unterstützung (Puts).</p>
          <StrikeBars
            data={oiData}
            spot={a.spot}
            upLabel="Call-OI"
            downLabel="Put-OI"
            markers={expiry?.maxPain ? [{ value: expiry.maxPain, label: "Max Pain", className: "stroke-neutral" }] : []}
          />
        </section>
        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-1 font-medium">Gamma-Exposure nach Strike</h2>
          <p className="mb-3 text-xs text-muted">Alle Verfälle ≤ 60 Tage. Positives Gamma bremst Kursbewegungen, negatives verstärkt sie.</p>
          <StrikeBars
            data={gexData}
            spot={a.spot}
            upLabel="positives GEX"
            downLabel="negatives GEX"
            upClass="fill-accent"
            downClass="fill-down"
            markers={a.gex.zeroGamma ? [{ value: a.gex.zeroGamma, label: "Flip", className: "stroke-[#8b6cf6]" }] : []}
          />
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-1 font-medium">Volatilitätskurve (Smile)</h2>
          <p className="mb-3 text-xs text-muted">Implizite Volatilität je Strike für den gewählten Verfall (OTM-Puts links, OTM-Calls rechts).</p>
          <Smile chain={chain} spot={a.spot} />
        </section>
        <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
          <h2 className="mb-3 font-medium">Laufzeitstruktur</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  {["Verfall", "Tage", "ATM-IV", "Erw. Bewegung", "Spanne 1σ", "Max Pain", "P/C OI"].map((h) => (
                    <th key={h} className="whitespace-nowrap px-2 py-2 text-right font-medium first:text-left">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {a.expiries.map((e, i) => (
                  <tr key={e.expiration} onClick={() => setSelected(i)} className={`cursor-pointer tabular-nums hover:bg-accent/[0.04] ${i === selected ? "bg-accent/[0.06]" : ""}`}>
                    <td className="whitespace-nowrap px-2 py-1.5">{fmtDate(e.expiration)}</td>
                    <td className="px-2 py-1.5 text-right">{Math.round(e.dte)}</td>
                    <td className="px-2 py-1.5 text-right">{pct(e.atmIv)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">{e.moveIv ? `± ${pct(e.moveIv / a.spot)}` : "–"}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right">{e.moveIv ? `${formatNumber(a.spot - e.moveIv)} – ${formatNumber(a.spot + e.moveIv)}` : "–"}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(e.maxPain)}</td>
                    <td className="px-2 py-1.5 text-right">{formatNumber(e.pcrOi, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-surface p-4 shadow-sm">
        <h2 className="mb-3 font-medium">Einordnung</h2>
        <ul className="space-y-2 text-sm">
          {insights({ a, expiry, ivHv, pcr, skew, positiveGamma }).map((text) => (
            <li key={text} className="flex gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
              <span>{text}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted">
          Automatisch erzeugte Hinweise auf Basis vereinfachter Annahmen (z. B. Positionierung der Market Maker). Keine Anlageberatung.
        </p>
      </section>
    </div>
  );
}

// Expected-move cone on every future weekday up to `horizonDays`: the implied
// variance (IV² · t) is interpolated linearly between expirations.
function buildCone(a: OptionsAnalysis, horizonDays: number): ConePoint[] {
  const last = a.candles.at(-1);
  if (!last) return [];
  const nodes = [{ t: 0, v: 0 }, ...a.expiries.filter((e) => e.atmIv != null).map((e) => ({ t: e.dte / 365, v: e.atmIv! ** 2 * (e.dte / 365) }))];
  if (nodes.length < 2) return [];
  const variance = (t: number) => {
    const i = nodes.findIndex((n) => n.t >= t);
    if (i === -1) {
      const n = nodes[nodes.length - 1];
      return (n.v / n.t) * t; // beyond the last expiry: keep its IV
    }
    if (i === 0) return 0;
    const [p, q] = [nodes[i - 1], nodes[i]];
    return p.v + ((q.v - p.v) * (t - p.t)) / (q.t - p.t);
  };
  const point = (time: number, t: number): ConePoint => {
    const m = a.spot * Math.sqrt(variance(t));
    return { time, mid: a.spot, up1: a.spot + m, down1: a.spot - m, up2: a.spot + 2 * m, down2: Math.max(0, a.spot - 2 * m) };
  };
  const points = [point(last.time, 0)];
  const nowSec = a.now / 1000;
  for (let day = 1; day <= horizonDays; day++) {
    const time = Math.floor(last.time + day * 86400);
    const weekday = new Date(time * 1000).getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    points.push(point(time, Math.max(0, time - nowSec) / (365 * 86400)));
  }
  return points;
}

// Strike window for the per-strike charts: ±15 % around spot
const nearSpot = (strike: number, spot: number) => Math.abs(strike / spot - 1) <= 0.15;

function strikeTable(chain?: Chain) {
  if (!chain) return [];
  const map = new Map<number, { strike: number; callOi: number; putOi: number }>();
  for (const c of chain.calls) map.set(c.strike, { strike: c.strike, callOi: c.openInterest, putOi: 0 });
  for (const p of chain.puts) map.set(p.strike, { ...(map.get(p.strike) ?? { strike: p.strike, callOi: 0, putOi: 0 }), putOi: p.openInterest });
  return [...map.values()].sort((a, b) => a.strike - b.strike);
}

// IV of the ~90 % put minus IV of the ~110 % call
function skew25(chain: Chain | undefined, spot: number) {
  if (!chain) return undefined;
  const near = (quotes: Chain["calls"], target: number) =>
    quotes.filter(validIv).reduce<(typeof quotes)[number] | undefined>((b, q) => (!b || Math.abs(q.strike - target) < Math.abs(b.strike - target) ? q : b), undefined);
  const put = near(chain.puts, spot * 0.9);
  const call = near(chain.calls, spot * 1.1);
  return put && call ? put.iv - call.iv : undefined;
}

function Smile({ chain, spot }: { chain?: Chain; spot: number }) {
  // OTM side of each strike: puts below spot, calls above.
  const points = useMemo(() => {
    if (!chain) return [];
    return [...chain.puts.filter((q) => q.strike < spot), ...chain.calls.filter((q) => q.strike >= spot)]
      .filter((q) => validIv(q) && Math.abs(q.strike / spot - 1) <= 0.25)
      .sort((a, b) => a.strike - b.strike);
  }, [chain, spot]);
  if (points.length < 3) return <p className="text-sm text-muted">Zu wenige gültige IV-Werte.</p>;

  const w = 520;
  const h = 220;
  const pad = 28;
  const xs = points.map((p) => p.strike);
  const ys = points.map((p) => p.iv);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys) * 0.95, Math.max(...ys) * 1.05];
  const x = (v: number) => pad + ((v - x0) / (x1 - x0 || 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - y0) / (y1 - y0 || 1)) * (h - 2 * pad);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-auto w-full">
      <polyline points={points.map((p) => `${x(p.strike)},${y(p.iv)}`).join(" ")} fill="none" strokeWidth={2} className="stroke-accent" />
      {points.map((p) => (
        <circle key={p.strike} cx={x(p.strike)} cy={y(p.iv)} r={2.5} className="fill-accent">
          <title>{`Strike ${formatNumber(p.strike)}: IV ${formatNumber(p.iv * 100, 1)} %`}</title>
        </circle>
      ))}
      <line x1={x(spot)} x2={x(spot)} y1={pad / 2} y2={h - pad} strokeDasharray="4 3" className="stroke-foreground" />
      <text x={x(spot) + 3} y={pad / 2 + 8} className="fill-muted text-[11px]">Kurs</text>
      {[y0, (y0 + y1) / 2, y1].map((v) => (
        <text key={v} x={2} y={y(v) + 4} className="fill-muted text-[10px]">{formatNumber(v * 100, 0)} %</text>
      ))}
      {[x0, spot, x1].map((v) => (
        <text key={v} x={x(v)} y={h - 8} textAnchor="middle" className="fill-muted text-[10px]">{formatNumber(v, 0)}</text>
      ))}
    </svg>
  );
}

function insights({
  a,
  expiry,
  ivHv,
  pcr,
  skew,
  positiveGamma,
}: {
  a: OptionsAnalysis;
  expiry?: OptionsAnalysis["expiries"][number];
  ivHv?: number;
  pcr?: number;
  skew?: number;
  positiveGamma: boolean;
}): string[] {
  const out: string[] = [];
  if (expiry?.moveIv) {
    out.push(
      `Bis zum Verfall am ${fmtDate(expiry.expiration)} preist der Markt eine Bewegung von ±${formatNumber(expiry.moveIv)} (${pct(expiry.moveIv / a.spot)}) ein – mit ca. 68 % Wahrscheinlichkeit liegt der Kurs dann zwischen ${formatNumber(a.spot - expiry.moveIv)} und ${formatNumber(a.spot + expiry.moveIv)}.`,
    );
  }
  if (a.gex.zeroGamma) {
    out.push(
      positiveGamma
        ? `Positives Netto-Gamma: Market Maker sichern gegenläufig ab (kaufen Rücksetzer, verkaufen Anstiege) – das dämpft die Volatilität, solange der Kurs über dem Gamma-Flip bei ${formatNumber(a.gex.zeroGamma)} bleibt.`
        : `Negatives Netto-Gamma: Absicherungen der Market Maker verstärken Bewegungen. Unter dem Gamma-Flip bei ${formatNumber(a.gex.zeroGamma)} sind größere, trendige Ausschläge wahrscheinlicher.`,
    );
  }
  if (expiry?.callWall && expiry.putWall) {
    out.push(`Größtes Open Interest: Call-Wall bei ${formatNumber(expiry.callWall)} (möglicher Widerstand), Put-Wall bei ${formatNumber(expiry.putWall)} (mögliche Unterstützung).`);
  }
  if (expiry?.maxPain && expiry.dte <= 10) {
    const diff = expiry.maxPain / a.spot - 1;
    if (Math.abs(diff) > 0.01) out.push(`Max Pain liegt ${formatPercent(diff * 100, 1)} vom Kurs entfernt bei ${formatNumber(expiry.maxPain)} – kurz vor Verfall kann der Kurs dorthin „gezogen“ werden (Pinning).`);
  }
  if (ivHv != null) {
    if (ivHv > 1.25) out.push(`Optionen sind im Verhältnis zur realisierten Schwankung teuer (IV/HV ${formatNumber(ivHv, 2)}). Für Käufer von Optionsscheinen ungünstig: Die Bewegung muss größer ausfallen als eingepreist. Eher längere Laufzeiten bzw. abwarten, bis die Volatilität sinkt – Termine wie Quartalszahlen beachten.`);
    else if (ivHv < 0.9) out.push(`Optionen sind im Verhältnis zur realisierten Schwankung günstig (IV/HV ${formatNumber(ivHv, 2)}). Gute Ausgangslage für Call- oder Put-Optionsscheine: Sie profitieren, wenn die Bewegung größer ausfällt als eingepreist.`);
    else out.push(`Implizite und realisierte Volatilität liegen nah beieinander (IV/HV ${formatNumber(ivHv, 2)}) – keine klare Über- oder Unterbewertung der Optionen.`);
  }
  if (skew != null && skew > 0.06) out.push(`Ausgeprägter Put-Skew (${formatNumber(skew * 100, 1)} Pkt.): Absicherung nach unten ist gefragt – Puts sind im Vergleich zu Calls teuer.`);
  if (pcr != null) {
    if (pcr > 1.3) out.push(`Hohes Put/Call-Verhältnis (${formatNumber(pcr, 2)}): viel Absicherung im Markt – konträr gelesen oft ein Zeichen pessimistischer Stimmung.`);
    else if (pcr < 0.6) out.push(`Niedriges Put/Call-Verhältnis (${formatNumber(pcr, 2)}): Calls dominieren – Hinweis auf optimistische, eventuell sorglose Stimmung.`);
  }
  return out;
}

function Stat({ label, value, tone = "", hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2.5 shadow-sm" title={hint}>
      <div className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="text-[11px] leading-tight text-muted">{label}</div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted">{label}</div>
      <div className="tabular-nums">{value}</div>
    </div>
  );
}
