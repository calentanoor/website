"use client";

import { useState } from "react";
import { fmtEur, fmtPct, sharesByWarrant, sortedBuys, type PositionView, type Tone } from "@/lib/os/ladder";
import type { CandidateView } from "@/lib/os/finder";
import type { Buy, Position, Settings, Warrant } from "@/lib/os/types";
import { LadderBar } from "./LadderBar";
import { Field, NumInput, buttonClass, fmtAge, fmtDate, inputClass, nowIso, primaryButtonClass, today, uid } from "./inputs";

export const TONE: Record<Tone, { dot: string; box: string; icon: string }> = {
  green: { dot: "bg-up", box: "border-up/40 bg-up/10 text-up", icon: "🟢" },
  yellow: { dot: "bg-neutral", box: "border-neutral/40 bg-neutral/10 text-neutral", icon: "🟡" },
  red: { dot: "bg-down", box: "border-down/40 bg-down/10 text-down", icon: "🔴" },
  orange: { dot: "bg-[#e8772e]", box: "border-[#e8772e]/40 bg-[#e8772e]/10 text-[#c8601f]", icon: "🟠" },
  white: { dot: "bg-border", box: "border-border bg-background text-foreground", icon: "⚪" },
  grey: { dot: "bg-muted", box: "border-border bg-background text-muted", icon: "⚪" },
};

const badgeClass = { info: "bg-accent/10 text-accent", warn: "bg-neutral/15 text-neutral", danger: "bg-down/12 text-down" };

type Props = {
  view: PositionView;
  settings: Settings;
  stockPrice?: number;
  stockPriceSource?: string;
  earningsDate?: number;
  best?: CandidateView;
  onChange: (p: Position) => void;
  onDelete: () => void;
  onOpenFinder: (symbol: string) => void;
};

export function PositionCard({ view: v, settings, stockPrice, stockPriceSource, earningsDate, best, onChange, onDelete, onOpenFinder }: Props) {
  const p = v.position;
  const [panel, setPanel] = useState<null | "buy" | "warrant" | "edit">(null);
  const [editWarrant, setEditWarrant] = useState<Warrant | null>(null);
  const shares = sharesByWarrant(p);
  const tone = TONE[v.action.tone];
  const update = (patch: Partial<Position>) => onChange({ ...p, ...patch });
  const setWarrant = (w: Warrant) => update({ warrants: p.warrants.some((x) => x.id === w.id) ? p.warrants.map((x) => (x.id === w.id ? w : x)) : [...p.warrants, w] });
  const showBest = best && (v.action.kind === "add" || v.action.kind === "breakeven" || !v.stage);

  return (
    <article id={`pos-${p.id}`} className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">{p.name ?? p.symbol}</h3>
            <span className="font-mono text-xs text-muted">{p.symbol}</span>
            {v.stage > 0 && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">Stufe {v.stage} · {v.units.toLocaleString("de-DE", { maximumFractionDigits: 1 })}x</span>}
          </div>
          <div className="text-xs text-muted">
            {p.sector} · Aktie {stockPrice ? `${stockPrice.toLocaleString("de-DE", { maximumFractionDigits: 2 })} USD` : "–"}
            {stockPriceSource ? ` (${stockPriceSource})` : ""}
            {earningsDate ? ` · Zahlen ${new Date(earningsDate).toLocaleDateString("de-DE")}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xl font-semibold tabular-nums ${v.plPct == null ? "text-muted" : v.plPct >= 0 ? "text-up" : "text-down"}`}>{fmtPct(v.plPct)}</div>
          <div className="text-xs text-muted tabular-nums">{fmtEur(v.value)} / {fmtEur(v.invested)}</div>
        </div>
      </header>

      <div className={`rounded-lg border px-3 py-2 ${tone.box}`}>
        <div className="font-medium">
          {tone.icon} {v.action.title}
        </div>
        {v.action.detail && <div className="text-sm opacity-90">{v.action.detail}</div>}
        {showBest && (
          <button onClick={() => onOpenFinder(p.symbol)} className="mt-1 text-left text-sm underline decoration-dotted underline-offset-2">
            Bester Schein jetzt: {best.candidate.wkn} ({best.candidate.issuer}, Basis {best.candidate.strike.toLocaleString("de-DE")} USD, Brief {fmtEur(best.candidate.ask)}) →
          </button>
        )}
        {(v.action.kind === "add" || v.action.kind === "breakeven" || !v.stage) && !best && (
          <button onClick={() => onOpenFinder(p.symbol)} className="mt-1 text-left text-sm underline decoration-dotted underline-offset-2">
            Kandidaten im Schein-Finder vergleichen →
          </button>
        )}
      </div>

      {v.badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {v.badges.map((b) => (
            <span key={b.label} className={`rounded-full px-2 py-0.5 text-xs ${badgeClass[b.tone]}`}>{b.label}</span>
          ))}
        </div>
      )}

      {v.stage > 0 && <LadderBar levels={v.levels} />}

      {v.levels.length > 1 && (
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-2">
          {v.levels.map((l) => (
            <div key={l.key} className="flex justify-between gap-2 border-b border-border/50 pb-1">
              <dt className="text-muted">{l.label}</dt>
              <dd className="whitespace-nowrap tabular-nums">
                {fmtEur(l.price)}
                {l.distancePct != null && <span className={`ml-1 text-xs ${l.distancePct >= 0 ? "text-up" : "text-down"}`}>{fmtPct(l.distancePct)}</span>}
              </dd>
            </div>
          ))}
          <div className="flex justify-between gap-2 border-b border-border/50 pb-1">
            <dt className="text-muted">Haltedauer</dt>
            <dd className="tabular-nums">{v.holdingDays != null ? `${v.holdingDays} Tage` : "–"}</dd>
          </div>
          <div className="flex justify-between gap-2 border-b border-border/50 pb-1">
            <dt className="text-muted">Restlaufzeit</dt>
            <dd className="tabular-nums">{v.remainingMonths != null ? `${v.remainingMonths.toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mon.` : "–"}</dd>
          </div>
        </dl>
      )}

      <section className="space-y-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted">Scheine</h4>
        {p.warrants.map((w) => (
          <div key={w.id} className="flex flex-wrap items-end gap-3 rounded-lg bg-background/70 p-2 text-sm">
            <div className="min-w-40 flex-1">
              <div className="font-medium">
                {w.wkn || "WKN fehlt"} <span className="font-normal text-muted">{w.issuer || "Emittent fehlt"}</span>
              </div>
              <div className="text-xs text-muted">
                Basis {w.strike.toLocaleString("de-DE")} USD · fällig {fmtDate(w.expiry)} · BV {w.ratio.toLocaleString("de-DE")}
                {shares.get(w.id) ? ` · ${shares.get(w.id)!.toLocaleString("de-DE", { maximumFractionDigits: 0 })} Stück` : ""}
              </div>
            </div>
            <div className="w-32">
              <Field label={`Geld (Bid) € · ${fmtAge(w.bidAsOf)}`}>
                <NumInput value={w.bid} digits={3} onChange={(bid) => setWarrant({ ...w, bid, bidAsOf: nowIso() })} />
              </Field>
            </div>
            <button onClick={() => { setEditWarrant(w); setPanel("warrant"); }} className="text-xs text-accent hover:underline">bearbeiten</button>
          </div>
        ))}
      </section>

      {p.buys.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Teilkäufe</h4>
          <ul className="divide-y divide-border/60 text-sm">
            {sortedBuys(p).map((b, i) => (
              <li key={b.id} className="flex items-center justify-between gap-2 py-1 tabular-nums">
                <span>
                  {i + 1}. {fmtDate(b.date)} · {p.warrants.find((w) => w.id === b.warrantId)?.wkn || "?"}
                </span>
                <span className="flex items-center gap-3">
                  {fmtEur(b.amount)} zu {fmtEur(b.price)}
                  <button onClick={() => confirm("Teilkauf löschen?") && update({ buys: p.buys.filter((x) => x.id !== b.id) })} className="text-xs text-muted hover:text-down" aria-label="Teilkauf löschen">✕</button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {p.status === "open" && (
          <>
            <button onClick={() => setPanel(panel === "buy" ? null : "buy")} className={primaryButtonClass}>Kauf erfassen</button>
            <button onClick={() => { setEditWarrant(null); setPanel(panel === "warrant" ? null : "warrant"); }} className={buttonClass}>Schein hinzufügen</button>
          </>
        )}
        <button onClick={() => setPanel(panel === "edit" ? null : "edit")} className={buttonClass}>Position bearbeiten</button>
        {p.status === "open" ? (
          <button
            onClick={() => confirm(`${p.symbol} als verkauft schließen${v.value ? ` (Erlös ca. ${fmtEur(v.value)})` : ""}?`) && update({ status: "closed", closedDate: today(), closedValue: v.value })}
            className={buttonClass}
          >
            Verkauft – schließen
          </button>
        ) : (
          <button onClick={() => update({ status: "open", closedDate: undefined, closedValue: undefined })} className={buttonClass}>Wieder öffnen</button>
        )}
      </div>

      {panel === "buy" && <BuyForm position={p} settings={settings} suggested={v.action.kind === "add" ? (v.action.addMultiple ?? 1) * settings.x : v.stage ? v.nextAddAmount : settings.x} onSave={(b) => { update({ buys: [...p.buys, b] }); setPanel(null); }} />}
      {panel === "warrant" && <WarrantForm initial={editWarrant} onSave={(w) => { setWarrant(w); setPanel(null); }} onDelete={editWarrant && !p.buys.some((b) => b.warrantId === editWarrant.id) ? () => { update({ warrants: p.warrants.filter((x) => x.id !== editWarrant.id) }); setPanel(null); } : undefined} />}
      {panel === "edit" && <PositionForm position={p} onSave={(patch) => { update(patch); setPanel(null); }} onDelete={onDelete} />}
    </article>
  );
}

function BuyForm({ position: p, settings, suggested, onSave }: { position: Position; settings: Settings; suggested?: number; onSave: (b: Buy) => void }) {
  const last = sortedBuys(p).at(-1);
  const [date, setDate] = useState(today());
  const [warrantId, setWarrantId] = useState(last?.warrantId ?? p.warrants.at(-1)?.id ?? "");
  const [price, setPrice] = useState<number | undefined>(p.warrants.find((w) => w.id === (last?.warrantId ?? p.warrants.at(-1)?.id))?.bid);
  const [amount, setAmount] = useState<number | undefined>(suggested ?? settings.x);
  const ok = warrantId && price && price > 0 && amount && amount > 0;
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-4">
      <Field label="Datum"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field>
      <Field label="Schein">
        <select value={warrantId} onChange={(e) => setWarrantId(e.target.value)} className={inputClass}>
          {p.warrants.map((w) => <option key={w.id} value={w.id}>{w.wkn || "ohne WKN"} · Basis {w.strike}</option>)}
        </select>
      </Field>
      <Field label="Kaufpreis je Schein (€)"><NumInput value={price} digits={3} onChange={setPrice} /></Field>
      <Field label="Betrag (€)" hint={`x = ${settings.x.toLocaleString("de-DE")} €`}><NumInput value={amount} digits={2} onChange={setAmount} /></Field>
      <div className="sm:col-span-4">
        <button disabled={!ok} onClick={() => onSave({ id: uid(), date, warrantId, price: price!, amount: amount! })} className={primaryButtonClass}>Teilkauf speichern</button>
      </div>
    </div>
  );
}

export function WarrantForm({ initial, onSave, onDelete }: { initial: Warrant | null; onSave: (w: Warrant) => void; onDelete?: () => void }) {
  const [w, setW] = useState<Warrant>(initial ?? { id: uid(), wkn: "", issuer: "", strike: NaN, expiry: "", ratio: 0.1 });
  const set = (patch: Partial<Warrant>) => setW((x) => ({ ...x, ...patch }));
  const ok = Number.isFinite(w.strike) && w.strike > 0 && w.expiry && w.ratio > 0;
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-4">
      <Field label="WKN"><input value={w.wkn} onChange={(e) => set({ wkn: e.target.value.toUpperCase() })} className={inputClass} /></Field>
      <Field label="Emittent"><input value={w.issuer} onChange={(e) => set({ issuer: e.target.value })} className={inputClass} /></Field>
      <Field label="Basispreis (USD)"><NumInput value={Number.isFinite(w.strike) ? w.strike : undefined} onChange={(v) => set({ strike: v ?? NaN })} /></Field>
      <Field label="Fälligkeit"><input type="date" value={w.expiry} onChange={(e) => set({ expiry: e.target.value })} className={inputClass} /></Field>
      <Field label="Bezugsverhältnis"><NumInput value={w.ratio} onChange={(v) => set({ ratio: v ?? 0.1 })} /></Field>
      <Field label={`Geld (Bid) € · ${fmtAge(w.bidAsOf)}`}><NumInput value={w.bid} digits={3} onChange={(bid) => set({ bid, bidAsOf: nowIso() })} /></Field>
      <Field label="Impl. Vola % (Datenblatt, optional)"><NumInput value={w.iv} scale={100} digits={1} onChange={(iv) => set({ iv, ivAsOf: nowIso() })} /></Field>
      <div className="flex items-end gap-2">
        <button disabled={!ok} onClick={() => onSave(w)} className={primaryButtonClass}>Schein speichern</button>
        {onDelete && <button onClick={onDelete} className={buttonClass}>Entfernen</button>}
      </div>
    </div>
  );
}

function PositionForm({ position: p, onSave, onDelete }: { position: Position; onSave: (patch: Partial<Position>) => void; onDelete: () => void }) {
  const [f, setF] = useState({ symbol: p.symbol, name: p.name ?? "", sector: p.sector, stockPrice: p.stockPrice, earningsDate: p.earningsDate ?? "", note: p.note ?? "" });
  return (
    <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
      <Field label="Ticker"><input value={f.symbol} onChange={(e) => setF({ ...f, symbol: e.target.value.toUpperCase() })} className={inputClass} /></Field>
      <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputClass} /></Field>
      <Field label="Sektor"><input value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value })} className={inputClass} /></Field>
      <Field label="Aktienkurs USD (leer = automatisch)" hint={p.stockPriceAsOf ? fmtAge(p.stockPriceAsOf) : undefined}><NumInput value={f.stockPrice} digits={2} onChange={(stockPrice) => setF({ ...f, stockPrice })} /></Field>
      <Field label="Quartalszahlen (leer = automatisch)"><input type="date" value={f.earningsDate} onChange={(e) => setF({ ...f, earningsDate: e.target.value })} className={inputClass} /></Field>
      <Field label="Notiz"><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className={inputClass} /></Field>
      <div className="flex flex-wrap gap-2 sm:col-span-3">
        <button
          onClick={() => onSave({ symbol: f.symbol, name: f.name || undefined, sector: f.sector || "Ohne Sektor", stockPrice: f.stockPrice, stockPriceAsOf: f.stockPrice !== p.stockPrice ? nowIso() : p.stockPriceAsOf, earningsDate: f.earningsDate || undefined, note: f.note || undefined })}
          className={primaryButtonClass}
        >
          Speichern
        </button>
        <button onClick={() => confirm("Position mit allen Teilkäufen löschen?") && onDelete()} className={`${buttonClass} text-down`}>Position löschen</button>
      </div>
    </div>
  );
}
