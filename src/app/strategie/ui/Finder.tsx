"use client";

import { useMemo, useState } from "react";
import { evaluateCandidate, modelPriceEur, parseCandidates, rankCandidates, type CandidateView, type Market } from "@/lib/os/finder";
import { fmtEur, fmtPct } from "@/lib/os/ladder";
import type { Candidate, Settings } from "@/lib/os/types";
import { buttonClass, fmtAge, fmtDate, inputClass, nowIso, primaryButtonClass, uid } from "./inputs";

const num = (v?: number, d = 2) => (v == null || !Number.isFinite(v) ? "–" : v.toLocaleString("de-DE", { maximumFractionDigits: d }));

export function rankFor(symbol: string, candidates: Candidate[], market: Market, settings: Settings): CandidateView[] {
  return rankCandidates(
    candidates.filter((c) => c.symbol === symbol).map((c) => evaluateCandidate(c, market, settings)),
    settings,
  );
}

type Props = {
  symbols: string[];
  symbol: string;
  onSymbol: (s: string) => void;
  candidates: Candidate[];
  settings: Settings;
  marketFor: (symbol: string) => Market;
  onCandidates: (update: (c: Candidate[]) => Candidate[]) => void;
  onAdopt: (c: Candidate) => void;
};

export function Finder({ symbols, symbol, onSymbol, candidates, settings, marketFor, onCandidates, onAdopt }: Props) {
  const [paste, setPaste] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const market = marketFor(symbol);
  const views = useMemo(() => rankFor(symbol, candidates, market, settings), [symbol, candidates, market, settings]);
  const f = settings.finder;

  const add = () => {
    const res = parseCandidates(paste);
    setErrors(res.errors);
    if (!res.candidates.length) return;
    const asOf = nowIso();
    onCandidates((list) => {
      // same WKN for the same share replaces the older entry
      const fresh = res.candidates.map((c) => ({ ...c, id: uid(), symbol, asOf }));
      const wkns = new Set(fresh.map((c) => c.wkn));
      return [...list.filter((c) => !(c.symbol === symbol && wkns.has(c.wkn))), ...fresh];
    });
    setPaste("");
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {[...new Set([...symbols, ...candidates.map((c) => c.symbol)])].map((s) => (
            <button key={s} onClick={() => onSymbol(s)} className={`rounded-full px-3 py-1 text-sm ring-1 ring-inset ${s === symbol ? "bg-accent/10 text-accent ring-accent/40" : "text-muted ring-border"}`}>
              {s}
            </button>
          ))}
          <input value={custom} onChange={(e) => setCustom(e.target.value.toUpperCase())} placeholder="andere Aktie" className={`${inputClass} !w-32`} />
          <button disabled={!custom} onClick={() => { onSymbol(custom); setCustom(""); }} className={buttonClass}>wählen</button>
        </div>
        <p className="text-sm text-muted">
          {symbol}: Aktie {market.stockPrice ? `${num(market.stockPrice)} USD` : "Kurs fehlt"} · EUR/USD {num(market.eurusd, 4)}
          {market.earningsDate ? ` · Quartalszahlen ${new Date(market.earningsDate).toLocaleDateString("de-DE")}` : ""}
        </p>
        <details open={!views.length}>
          <summary className="cursor-pointer text-sm font-medium">Kandidaten einfügen (Tabelle aus dem Broker kopieren)</summary>
          <p className="mt-2 text-xs text-muted">
            Spalten mit Überschrift (beliebige Reihenfolge) oder ohne Überschrift in dieser Reihenfolge: WKN, Emittent, Basispreis, Fälligkeit, Bezugsverhältnis, Geld, Brief,
            Omega, implizite Volatilität, Aufgeld p.a., Theta. Trennzeichen Tab, Semikolon oder Komma; deutsche Zahlen erlaubt.
          </p>
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={5} placeholder={"WKN\tEmittent\tBasispreis\tFälligkeit\tBV\tGeld\tBrief\tOmega\tImpl. Vola\nAB1234\tVontobel\t200\t15.12.2028\t0,1\t4,10\t4,15\t2,8\t45 %"} className={`${inputClass} mt-2 font-mono text-xs`} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button disabled={!paste.trim()} onClick={add} className={primaryButtonClass}>Für {symbol} übernehmen</button>
            {errors.map((e) => <span key={e} className="text-xs text-down">{e}</span>)}
          </div>
        </details>
        <p className="text-xs text-muted">
          Filter: Omega {num(f.omegaMin)}–{num(f.omegaMax)} · Restlaufzeit ≥ {f.minMonths} Mon. · Basis ≤ {num(f.maxStrikeFactor)} × Kurs · Spread ≤ {num(f.maxSpread * 100, 1)} %. Ranking
          nach Zeitwertverlust, impliziter Vola, Vega und Spread (Gewichte in den Einstellungen).
        </p>
      </section>

      {views.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-sm text-muted">Noch keine Kandidaten für {symbol}.</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {views.map((v) => (
            <CandidateCard key={v.candidate.id} v={v} market={market} settings={settings} onDelete={() => onCandidates((l) => l.filter((c) => c.id !== v.candidate.id))} onAdopt={() => onAdopt(v.candidate)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CandidateCard({ v, market, settings, onDelete, onAdopt }: { v: CandidateView; market: Market; settings: Settings; onDelete: () => void; onAdopt: () => void }) {
  const c = v.candidate;
  const model = modelPriceEur(v, market, settings);
  const passed = !v.violations.length;
  return (
    <article className={`space-y-2 rounded-xl border bg-surface p-4 shadow-sm ${v.best ? "border-up ring-2 ring-up/30" : passed ? "border-border" : "border-border opacity-70"}`}>
      <header className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">{c.wkn}</span>
            {v.best && <span className="rounded-full bg-up/15 px-2 py-0.5 text-xs font-medium text-up">bester Kandidat</span>}
          </div>
          <div className="text-xs text-muted">
            {c.issuer || "–"} · Basis {num(c.strike)} USD · fällig {fmtDate(c.expiry)} ({num(v.months, 1)} Mon.) · BV {num(c.ratio, 3)} · {fmtAge(c.asOf)}
          </div>
        </div>
        <div className="text-right text-sm tabular-nums">
          <div className="whitespace-nowrap">{fmtEur(c.bid)} / {fmtEur(c.ask)}</div>
          <div className="text-xs text-muted">Spread {v.spread != null ? `${num(v.spread * 100, 2)} %` : "–"}</div>
        </div>
      </header>
      {!passed && <p className="text-xs text-down">Fällt raus: {v.violations.join(" · ")}</p>}
      {v.earningsSoon && <p className="text-xs text-neutral">Quartalszahlen in weniger als {settings.earnings.days} Tagen – Kauf nach den Zahlen meist günstiger.</p>}
      <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        <Metric label="Omega" value={num(v.omega)} note={v.omegaSource} />
        <Metric label="Impl. Vola" value={v.iv != null ? `${num(v.iv * 100, 1)} %` : "–"} note={v.ivSource} />
        <Metric label="Wert nach 3 Mon." value={fmtPct(v.timeLoss3m)} note={v.timeLossSource} />
        <Metric label="Vega je Vola-Pkt." value={v.vegaPct != null ? `${num(v.vegaPct, 2)} %` : "–"} note="Modell" />
        <Metric label="Bei −3 Vola-Pkt." value={fmtPct(v.volMinus3)} note="Modell" />
        <Metric label="Modellwert" value={fmtEur(model)} note="Modell" />
      </dl>
      <div className="rounded-lg bg-background/70 p-2 text-sm">
        <div className="text-xs text-muted">Nötige Aktienbewegung für +20 % im Schein (Modell)</div>
        <div className="tabular-nums">sofort {fmtPct(v.move.now)} · nach 1 Mon. {fmtPct(v.move.m1)} · nach 3 Mon. {fmtPct(v.move.m3)}</div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted">{v.score != null ? `Score ${num(v.score, 2)} (niedriger = besser)` : "kein Score"}</span>
        <span className="flex gap-2">
          <button onClick={onAdopt} className={buttonClass}>In Position übernehmen</button>
          <button onClick={onDelete} className="text-xs text-muted hover:text-down" aria-label="Kandidat löschen">✕</button>
        </span>
      </div>
    </article>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/50 pb-0.5">
      <dt className="text-muted">{label}</dt>
      <dd className="whitespace-nowrap text-right tabular-nums">
        {value}
        {note && <span className="ml-1 text-[10px] text-muted">{note === "Modell" ? "Modell" : note === "Datenblatt" ? "DB" : note}</span>}
      </dd>
    </div>
  );
}
