"use client";

import { useMemo, useState } from "react";
import type { ScreenerRow } from "@/lib/types";
import { useSavedViews, useWatchlist, type FilterRule, type SavedView } from "@/lib/storage";
import { useRows } from "@/lib/use-rows";
import { ScreenerTable } from "@/components/ScreenerTable";

type NumericField = { key: keyof ScreenerRow; label: string; unit?: string; factor?: number };

// factor converts the stored value into the unit shown in the filter inputs.
const FIELDS: NumericField[] = [
  { key: "total", label: "Gesamt-Score" },
  { key: "fundamental", label: "Fundamental-Score" },
  { key: "technical", label: "Technik-Score" },
  { key: "analystScore", label: "Analysten-Konsens (Score)" },
  { key: "analysts", label: "Anzahl Analysten" },
  { key: "targetUpside", label: "Kursziel-Potenzial", unit: "%" },
  { key: "forwardPE", label: "KGV (erwartet)" },
  { key: "pegRatio", label: "PEG-Ratio" },
  { key: "dividendYield", label: "Dividendenrendite", unit: "%" },
  { key: "returnOnEquity", label: "Eigenkapitalrendite", unit: "%" },
  { key: "revenueGrowth", label: "Umsatzwachstum", unit: "%" },
  { key: "perf1m", label: "Performance 1 Monat", unit: "%" },
  { key: "perf6m", label: "Performance 6 Monate", unit: "%" },
  { key: "rsi", label: "RSI (14)" },
  { key: "marketCap", label: "Marktkapitalisierung", unit: "Mrd.", factor: 1e-9 },
  { key: "changePercent", label: "Veränderung heute", unit: "%" },
];

const PRESETS: Omit<SavedView, "id" | "universe">[] = [
  { name: "Value", rules: [{ field: "forwardPE", min: 0, max: 15 }, { field: "fundamental", min: 60 }], sectors: [], signal: "all" },
  { name: "Momentum", rules: [{ field: "technical", min: 70 }, { field: "perf6m", min: 10 }], sectors: [], signal: "bullish" },
  { name: "Dividende", rules: [{ field: "dividendYield", min: 3 }, { field: "fundamental", min: 50 }], sectors: [], signal: "all" },
  { name: "Analysten-Favoriten", rules: [{ field: "analystScore", min: 70 }, { field: "targetUpside", min: 15 }, { field: "analysts", min: 10 }], sectors: [], signal: "all" },
  { name: "Überverkauft", rules: [{ field: "rsi", max: 35 }, { field: "fundamental", min: 55 }], sectors: [], signal: "all" },
];

const newView = (indexId: string): SavedView => ({ id: "", name: "", universe: [indexId], rules: [{ field: "total", min: 60 }], sectors: [], signal: "all" });

function matches(row: ScreenerRow, view: SavedView) {
  if (view.sectors.length && !view.sectors.includes(row.sector ?? "")) return false;
  if (view.signal !== "all" && !row.signals.some((s) => s.tone === view.signal)) return false;
  return view.rules.every((rule) => {
    const field = FIELDS.find((f) => f.key === rule.field);
    if (!field || (rule.min == null && rule.max == null)) return true;
    const raw = row[field.key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) return false;
    const v = raw * (field.factor ?? 1);
    return (rule.min == null || v >= rule.min) && (rule.max == null || v <= rule.max);
  });
}

const inputClass = "rounded-md border border-border bg-background px-2 py-1.5 text-sm outline-none focus:border-accent";

export function CustomScreener({ indices }: { indices: { id: string; name: string }[] }) {
  const watchlist = useWatchlist();
  const [views, setViews] = useSavedViews();
  const [view, setView] = useState<SavedView>(() => newView(indices[0].id));

  const indexIds = view.universe.filter((u) => u !== "watchlist");
  const symbols = view.universe.includes("watchlist") ? watchlist.list : [];
  const { rows, error, loading } = useRows(indexIds, symbols);

  const filtered = useMemo(() => rows?.filter((r) => !r.error && matches(r, view)), [rows, view]);
  const sectors = useMemo(() => [...new Set((rows ?? []).map((r) => r.sector).filter((s): s is string => !!s))].sort(), [rows]);

  const update = (patch: Partial<SavedView>) => setView((v) => ({ ...v, ...patch }));
  const updateRule = (i: number, patch: Partial<FilterRule>) =>
    update({ rules: view.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const toggleIn = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  const save = () => {
    const name = view.name.trim();
    if (!name) return;
    const id = view.id || (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Math.random()));
    const saved = { ...view, id, name };
    setViews((vs) => [...vs.filter((v) => v.id !== id), saved]);
    setView(saved);
  };

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ring-1 ring-inset transition-colors ${
      active ? "bg-accent/10 text-accent ring-accent/40" : "text-muted ring-border hover:text-foreground"
    }`;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <section className="space-y-5 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div>
            <h2 className="mb-2 text-sm font-medium">Universum</h2>
            <div className="flex flex-wrap gap-2">
              {indices.map((i) => (
                <button key={i.id} onClick={() => update({ universe: toggleIn(view.universe, i.id) })} className={chip(view.universe.includes(i.id))}>
                  {i.name}
                </button>
              ))}
              <button onClick={() => update({ universe: toggleIn(view.universe, "watchlist") })} className={chip(view.universe.includes("watchlist"))}>
                ★ Watchlist ({watchlist.list.length})
              </button>
            </div>
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium">Kennzahlen-Filter</h2>
            <div className="space-y-2">
              {view.rules.map((rule, i) => {
                const field = FIELDS.find((f) => f.key === rule.field);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select value={rule.field} onChange={(e) => updateRule(i, { field: e.target.value })} className={`${inputClass} w-60`}>
                      {FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                    <NumberInput value={rule.min} onChange={(min) => updateRule(i, { min })} placeholder="min" />
                    <span className="text-muted">bis</span>
                    <NumberInput value={rule.max} onChange={(max) => updateRule(i, { max })} placeholder="max" />
                    <span className="w-8 text-xs text-muted">{field?.unit}</span>
                    <button onClick={() => update({ rules: view.rules.filter((_, j) => j !== i) })} className="rounded p-1 text-muted hover:text-down" title="Filter entfernen">
                      ✕
                    </button>
                  </div>
                );
              })}
              <button onClick={() => update({ rules: [...view.rules, { field: "fundamental" }] })} className="text-sm text-accent hover:underline">
                + Filter hinzufügen
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
            <div>
              <h2 className="mb-2 text-sm font-medium">Signale</h2>
              <select value={view.signal} onChange={(e) => update({ signal: e.target.value as SavedView["signal"] })} className={inputClass}>
                <option value="all">egal</option>
                <option value="bullish">mind. ein bullishes Signal</option>
                <option value="bearish">mind. ein bearishes Signal</option>
              </select>
            </div>
            {sectors.length > 0 && (
              <div className="min-w-0 flex-1">
                <h2 className="mb-2 text-sm font-medium">Sektoren {view.sectors.length === 0 && <span className="font-normal text-muted">(alle)</span>}</h2>
                <div className="flex flex-wrap gap-1.5">
                  {sectors.map((s) => (
                    <button key={s} onClick={() => update({ sectors: toggleIn(view.sectors, s) })} className={`${chip(view.sectors.includes(s))} !px-2.5 !py-0.5 text-xs`}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <aside className="space-y-4 rounded-xl border border-border bg-surface p-4 shadow-sm">
          <div>
            <h2 className="mb-2 text-sm font-medium">Ansicht speichern</h2>
            <div className="flex gap-2">
              <input value={view.name} onChange={(e) => update({ name: e.target.value })} placeholder="Name" className={`${inputClass} min-w-0 flex-1`} />
              <button onClick={save} disabled={!view.name.trim()} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
                Speichern
              </button>
            </div>
          </div>
          <div>
            <h2 className="mb-2 text-sm font-medium">Gespeicherte Ansichten</h2>
            {views.length === 0 ? (
              <p className="text-xs text-muted">Noch keine.</p>
            ) : (
              <ul className="space-y-1">
                {views.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2">
                    <button onClick={() => setView(v)} className={`truncate text-left text-sm hover:text-accent ${v.id === view.id ? "font-medium text-accent" : ""}`}>
                      {v.name}
                    </button>
                    <button onClick={() => setViews((vs) => vs.filter((x) => x.id !== v.id))} className="text-xs text-muted hover:text-down" title="Löschen">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h2 className="mb-2 text-sm font-medium">Vorlagen</h2>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button key={p.name} onClick={() => setView({ ...p, id: "", name: "", universe: view.universe })} className={`${chip(false)} !px-2.5 !py-0.5 text-xs`}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        </aside>
      </div>

      {view.universe.length === 0 ? (
        <p className="text-sm text-muted">Bitte mindestens einen Index oder die Watchlist wählen.</p>
      ) : error ? (
        <p className="text-sm text-down">Fehler beim Laden: {error}</p>
      ) : loading || !filtered ? (
        <div className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted shadow-sm">
          <div className="mx-auto mb-3 size-6 animate-spin rounded-full border-2 border-border border-t-accent" />
          Lade Werte … Beim ersten Aufruf eines Index kann das bis zu einer Minute dauern.
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            <span className="font-medium text-foreground">{filtered.length}</span> von {rows?.length} Werten erfüllen die Filter.
          </p>
          <ScreenerTable rows={filtered} showStats={false} />
        </>
      )}
    </div>
  );
}

function NumberInput({ value, onChange, placeholder }: { value?: number; onChange: (v: number | undefined) => void; placeholder: string }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
      placeholder={placeholder}
      className={`${inputClass} w-24`}
    />
  );
}
