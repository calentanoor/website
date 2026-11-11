"use client";

import { useState } from "react";
import { fmtEur, fmtPct, sortedBuys, sortedSells, tradeStats, type PositionView, type Tone } from "@/lib/os/ladder";
import type { CandidateView } from "@/lib/os/finder";
import type { Buy, Position, Sell, Settings, Warrant } from "@/lib/os/types";
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
  mergeTargets?: { id: string; label: string }[]; // other positions of the same share
  onMerge?: (otherId: string) => void;
};

export function PositionCard({ view: v, settings, stockPrice, stockPriceSource, earningsDate, best, onChange, onDelete, onOpenFinder, mergeTargets = [], onMerge }: Props) {
  const p = v.position;
  const [panel, setPanel] = useState<null | "buy" | "sell" | "sellAll" | "warrant" | "edit">(null);
  const [editWarrant, setEditWarrant] = useState<Warrant | null>(null);
  const stats = tradeStats(p);
  const active = p.status === "open" && v.stage > 0 && stats.perWarrant.some((w) => w.held > 0);
  const sells = sortedSells(p);
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

      {/* ladder and levels only while pieces are held */}
      {active && <LadderBar levels={v.levels} />}

      {active && v.levels.length > 1 && (
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
              </div>
              <WarrantLine stat={stats.perWarrant.find((x) => x.warrant.id === w.id)} />
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

      {sells.length > 0 && (
        <section>
          <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">Verkäufe</h4>
          <ul className="divide-y divide-border/60 text-sm">
            {sells.map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 py-1 tabular-nums">
                <span>
                  {fmtDate(x.date)} · {p.warrants.find((w) => w.id === x.warrantId)?.wkn || "?"}
                </span>
                <span className="flex items-center gap-3">
                  {x.quantity.toLocaleString("de-DE", { maximumFractionDigits: 2 })} Stück zu {fmtEur(x.price)} = {fmtEur(x.quantity * x.price)}
                  <button onClick={() => confirm("Verkauf löschen?") && update({ sells: (p.sells ?? []).filter((y) => y.id !== x.id) })} className="text-xs text-muted hover:text-down" aria-label="Verkauf löschen">✕</button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted tabular-nums">
            Erlös {fmtEur(stats.proceeds)} · realisiert {fmtEur(stats.realizedPl)}
            {stats.returnPct != null && <> · Rendite <span className={stats.returnPct >= 0 ? "text-up" : "text-down"}>{fmtPct(stats.returnPct)}</span></>}
            {stats.days != null && ` · ${stats.days} Tage`}
          </p>
        </section>
      )}
      {p.status === "closed" && !sells.length && p.closedValue != null && (
        <p className="text-xs text-muted">Ohne erfasste Verkäufe geschlossen, Erlös laut Abschluss {fmtEur(p.closedValue)}. Für genaue Werte Verkäufe nachtragen.</p>
      )}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setPanel(panel === "buy" ? null : "buy")} className={p.status === "open" ? primaryButtonClass : buttonClass}>Kauf erfassen</button>
        <button disabled={!p.buys.length} onClick={() => setPanel(panel === "sell" ? null : "sell")} className={buttonClass}>Verkauf erfassen</button>
        <button onClick={() => { setEditWarrant(null); setPanel(panel === "warrant" ? null : "warrant"); }} className={buttonClass}>Schein hinzufügen</button>
        <button onClick={() => setPanel(panel === "edit" ? null : "edit")} className={buttonClass}>Position bearbeiten</button>
        {p.status === "open" ? (
          <button onClick={() => setPanel(panel === "sellAll" ? null : "sellAll")} className={buttonClass}>
            {stats.perWarrant.some((w) => w.held > 0) ? "Alles verkaufen & schließen" : "Schließen"}
          </button>
        ) : (
          <button onClick={() => update({ status: "open", closedDate: undefined, closedValue: undefined })} className={buttonClass}>Wieder öffnen</button>
        )}
      </div>

      {(panel === "sell" || panel === "sellAll") && (
        <SellForm
          position={p}
          all={panel === "sellAll"}
          onSave={(newSells, close) => {
            const last = [...newSells].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.date ?? today();
            update({ sells: [...(p.sells ?? []), ...newSells], ...(close ? { status: "closed" as const, closedDate: last, closedValue: undefined } : {}) });
            setPanel(null);
          }}
        />
      )}
      {panel === "buy" && <BuyForm position={p} settings={settings} suggested={v.action.kind === "add" ? (v.action.addMultiple ?? 1) * settings.x : v.stage ? v.nextAddAmount : settings.x} onSave={(b) => { update({ buys: [...p.buys, b] }); setPanel(null); }} />}
      {panel === "warrant" && <WarrantForm initial={editWarrant} onSave={(w) => { setWarrant(w); setPanel(null); }} onDelete={editWarrant && !p.buys.some((b) => b.warrantId === editWarrant.id) ? () => { update({ warrants: p.warrants.filter((x) => x.id !== editWarrant.id) }); setPanel(null); } : undefined} />}
      {panel === "edit" && <PositionForm position={p} onSave={(patch) => { update(patch); setPanel(null); }} onDelete={onDelete} mergeTargets={mergeTargets} onMerge={onMerge} />}
    </article>
  );
}

function WarrantLine({ stat }: { stat?: ReturnType<typeof tradeStats>["perWarrant"][number] }) {
  if (!stat || !stat.bought) return <div className="text-xs text-muted">noch nicht gekauft</div>;
  const pl = stat.avgBuy && stat.warrant.bid != null && stat.held > 0 ? (stat.warrant.bid / stat.avgBuy - 1) * 100 : undefined;
  const n = (x: number) => x.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  return (
    <div className="text-xs tabular-nums">
      {n(stat.held)} von {n(stat.bought)} Stück gehalten · Ø Kauf {fmtEur(stat.avgBuy)}
      {stat.held > 0 && stat.value != null && <> · Wert {fmtEur(stat.value)}</>}
      {pl != null && <span className={pl >= 0 ? " text-up" : " text-down"}> ({fmtPct(pl)})</span>}
      {stat.sold > 0 && <> · verkauft Ø {fmtEur(stat.avgSell)}</>}
    </div>
  );
}

// Sale of one warrant, or ("all") of every piece still held at the current bids.
function SellForm({ position: p, all, onSave }: { position: Position; all: boolean; onSave: (sells: Sell[], close: boolean) => void }) {
  const stats = tradeStats(p).perWarrant.filter((w) => w.bought > 0);
  const heldStats = stats.filter((w) => w.held > 0);
  const [date, setDate] = useState(today());
  const [rows, setRows] = useState(() =>
    (all ? heldStats : [heldStats[0] ?? stats[0]].filter(Boolean)).map((w) => ({ warrantId: w.warrant.id, quantity: w.held || undefined, price: w.warrant.bid })),
  );
  const [close, setClose] = useState(all);
  const setRow = (i: number, patch: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const valid = rows.filter((r) => r.warrantId && r.quantity && r.quantity > 0 && r.price != null && r.price >= 0);
  const proceeds = valid.reduce((a, r) => a + r.quantity! * r.price!, 0);
  const sellsAll = heldStats.every((w) => valid.filter((r) => r.warrantId === w.warrant.id).reduce((a, r) => a + r.quantity!, 0) >= w.held - 1e-6);
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Verkaufsdatum"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} /></Field>
      </div>
      {rows.map((r, i) => {
        const st = stats.find((w) => w.warrant.id === r.warrantId);
        return (
          <div key={i} className="grid gap-3 sm:grid-cols-4">
            <Field label="Schein">
              <select value={r.warrantId} onChange={(e) => { const w = stats.find((x) => x.warrant.id === e.target.value); setRow(i, { warrantId: e.target.value, quantity: w?.held || undefined, price: w?.warrant.bid }); }} className={inputClass}>
                {stats.map((w) => <option key={w.warrant.id} value={w.warrant.id}>{w.warrant.wkn || "ohne WKN"} ({w.held.toLocaleString("de-DE", { maximumFractionDigits: 0 })} Stück)</option>)}
              </select>
            </Field>
            <Field label="Stück" hint={st ? `gehalten ${st.held.toLocaleString("de-DE", { maximumFractionDigits: 2 })}` : undefined}><NumInput value={r.quantity} digits={2} onChange={(quantity) => setRow(i, { quantity })} /></Field>
            <Field label="Verkaufspreis je Schein (€)"><NumInput value={r.price} digits={3} onChange={(price) => setRow(i, { price })} /></Field>
            <div className="flex items-end text-sm tabular-nums text-muted">= {fmtEur(r.quantity && r.price != null ? r.quantity * r.price : undefined)}</div>
          </div>
        );
      })}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm tabular-nums">Erlös {fmtEur(proceeds)}</span>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={close} onChange={(e) => setClose(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Position danach schließen{sellsAll ? "" : " (es bleiben Stücke übrig)"}
        </label>
        <button
          disabled={!valid.length}
          onClick={() => onSave(valid.map((r) => ({ id: uid(), date, warrantId: r.warrantId, quantity: r.quantity!, price: r.price! })), close)}
          className={primaryButtonClass}
        >
          Verkauf speichern
        </button>
      </div>
    </div>
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

function PositionForm({ position: p, onSave, onDelete, mergeTargets = [], onMerge }: { position: Position; onSave: (patch: Partial<Position>) => void; onDelete: () => void; mergeTargets?: { id: string; label: string }[]; onMerge?: (otherId: string) => void }) {
  const [mergeId, setMergeId] = useState(mergeTargets[0]?.id ?? "");
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
      {onMerge && mergeTargets.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3 sm:col-span-3">
          <Field label={`Andere ${p.symbol}-Position hier hinein übernehmen`} hint="Scheine, Käufe und Verkäufe werden zusammengelegt, die andere Position entfällt.">
            <select value={mergeId} onChange={(e) => setMergeId(e.target.value)} className={inputClass}>
              {mergeTargets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </Field>
          <button disabled={!mergeId} onClick={() => confirm("Positionen zusammenführen?") && onMerge(mergeId)} className={buttonClass}>Zusammenführen</button>
        </div>
      )}
    </div>
  );
}
