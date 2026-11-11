"use client";

import { useRef, useState } from "react";
import { DEFAULT_SETTINGS, startData } from "@/lib/os/defaults";
import type { OsStore, Settings } from "@/lib/os/types";
import { Field, NumInput, Toggle, buttonClass, inputClass, primaryButtonClass } from "./inputs";

export function SettingsPanel({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const s = settings;
  const set = (patch: Partial<Settings>) => onChange({ ...s, ...patch });
  const setFinder = (patch: Partial<Settings["finder"]>) => set({ finder: { ...s.finder, ...patch } });
  const [newSector, setNewSector] = useState("");
  const card = "space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm";
  const grid = "grid gap-3 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div className="space-y-4">
      <section className={card}>
        <h3 className="font-medium">Leiter</h3>
        <div className={grid}>
          <Field label="Betrag x (€)"><NumInput value={s.x} digits={2} onChange={(x) => x && set({ x })} /></Field>
          <Field label="Gewinnziel (%)"><NumInput value={s.takeProfit} scale={100} digits={1} onChange={(v) => v && set({ takeProfit: v })} /></Field>
          <Field label="Stufe 2 nach Rückgang (%)" hint="20–30 %, unter dem Preis von Stufe 1"><NumInput value={s.drop1} scale={100} digits={1} onChange={(v) => v && set({ drop1: v })} /></Field>
          <Field label="Stufe 3 nach weiterem Rückgang (%)" hint="unter dem Preis von Stufe 2"><NumInput value={s.drop2} scale={100} digits={1} onChange={(v) => v && set({ drop2: v })} /></Field>
        </div>
      </section>

      <section className={card}>
        <h3 className="font-medium">Leitplanken</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Guard label="Verlust-Stopp nach 4x" enabled={s.stopAfterLast.enabled} onToggle={(enabled) => set({ stopAfterLast: { ...s.stopAfterLast, enabled } })}>
            <Field label="weiterer Rückgang unter Stufe 3 (%)"><NumInput value={s.stopAfterLast.drop} scale={100} digits={1} onChange={(v) => v && set({ stopAfterLast: { ...s.stopAfterLast, drop: v } })} /></Field>
          </Guard>
          <Guard label="Zeit-Stopp" enabled={s.timeStop.enabled} onToggle={(enabled) => set({ timeStop: { ...s.timeStop, enabled } })}>
            <Field label="Monate ohne Ziel"><NumInput value={s.timeStop.months} digits={1} onChange={(v) => v && set({ timeStop: { ...s.timeStop, months: v } })} /></Field>
          </Guard>
          <Guard label="Quartalszahlen-Hinweis" enabled={s.earnings.enabled} onToggle={(enabled) => set({ earnings: { ...s.earnings, enabled } })}>
            <Field label="Tage vorher"><NumInput value={s.earnings.days} digits={0} onChange={(v) => v && set({ earnings: { ...s.earnings, days: v } })} /></Field>
          </Guard>
          <Guard label="Restlaufzeit-Warnung" enabled={s.minRemaining.enabled} onToggle={(enabled) => set({ minRemaining: { ...s.minRemaining, enabled } })}>
            <Field label="unter Monaten"><NumInput value={s.minRemaining.months} digits={1} onChange={(v) => v && set({ minRemaining: { ...s.minRemaining, months: v } })} /></Field>
          </Guard>
          <Guard label="Positionen in Stufe 4x je Sektor" enabled={s.maxStage3.enabled} onToggle={(enabled) => set({ maxStage3: { ...s.maxStage3, enabled } })}>
            <Field label="Warnung bei mehr als"><NumInput value={s.maxStage3.count} digits={0} onChange={(v) => v != null && set({ maxStage3: { ...s.maxStage3, count: v } })} /></Field>
          </Guard>
          <Guard label="Hinweis „Vola hoch“" enabled={s.highVol.enabled} onToggle={(enabled) => set({ highVol: { ...s.highVol, enabled } })}>
            <Field label="ab impliziter Vola (%)"><NumInput value={s.highVol.iv} scale={100} digits={1} onChange={(v) => v && set({ highVol: { ...s.highVol, iv: v } })} /></Field>
          </Guard>
        </div>
      </section>

      <section className={card}>
        <h3 className="font-medium">Sektor-Budgets (€, gesamt investiert)</h3>
        <div className={grid}>
          {Object.entries(s.sectorBudgets).map(([sector, budget]) => (
            <Field key={sector} label={sector}>
              <div className="flex gap-2">
                <NumInput value={budget} digits={0} onChange={(v) => set({ sectorBudgets: { ...s.sectorBudgets, [sector]: v ?? 0 } })} />
                <button onClick={() => { const rest = { ...s.sectorBudgets }; delete rest[sector]; set({ sectorBudgets: rest }); }} className="text-xs text-muted hover:text-down" aria-label="Budget entfernen">✕</button>
              </div>
            </Field>
          ))}
          <Field label="Neuer Sektor">
            <div className="flex gap-2">
              <input value={newSector} onChange={(e) => setNewSector(e.target.value)} className={inputClass} />
              <button disabled={!newSector} onClick={() => { set({ sectorBudgets: { ...s.sectorBudgets, [newSector]: 10000 } }); setNewSector(""); }} className={buttonClass}>+</button>
            </div>
          </Field>
        </div>
      </section>

      <section className={card}>
        <h3 className="font-medium">Schein-Finder</h3>
        <div className={grid}>
          <Field label="Omega min"><NumInput value={s.finder.omegaMin} digits={2} onChange={(v) => v && setFinder({ omegaMin: v })} /></Field>
          <Field label="Omega max"><NumInput value={s.finder.omegaMax} digits={2} onChange={(v) => v && setFinder({ omegaMax: v })} /></Field>
          <Field label="Restlaufzeit min (Monate)"><NumInput value={s.finder.minMonths} digits={1} onChange={(v) => v && setFinder({ minMonths: v })} /></Field>
          <Field label="Basis max (× Aktienkurs)"><NumInput value={s.finder.maxStrikeFactor} digits={2} onChange={(v) => v && setFinder({ maxStrikeFactor: v })} /></Field>
          <Field label="Spread max (%)"><NumInput value={s.finder.maxSpread} scale={100} digits={2} onChange={(v) => v && setFinder({ maxSpread: v })} /></Field>
          <Field label="Gewicht Zeitwertverlust"><NumInput value={s.finder.weights.time} digits={2} onChange={(v) => setFinder({ weights: { ...s.finder.weights, time: v ?? 0 } })} /></Field>
          <Field label="Gewicht impl. Vola"><NumInput value={s.finder.weights.iv} digits={2} onChange={(v) => setFinder({ weights: { ...s.finder.weights, iv: v ?? 0 } })} /></Field>
          <Field label="Gewicht Vega"><NumInput value={s.finder.weights.vega} digits={2} onChange={(v) => setFinder({ weights: { ...s.finder.weights, vega: v ?? 0 } })} /></Field>
          <Field label="Gewicht Spread"><NumInput value={s.finder.weights.spread} digits={2} onChange={(v) => setFinder({ weights: { ...s.finder.weights, spread: v ?? 0 } })} /></Field>
        </div>
      </section>

      <section className={card}>
        <h3 className="font-medium">Modell</h3>
        <div className={grid}>
          <Field label="Zins r (%)"><NumInput value={s.rate} scale={100} digits={2} onChange={(v) => set({ rate: v ?? 0 })} /></Field>
          <Field label="Dividendenrendite q (%)"><NumInput value={s.dividendYield} scale={100} digits={2} onChange={(v) => set({ dividendYield: v ?? 0 })} /></Field>
          <Field label="EUR/USD manuell (leer = automatisch)"><NumInput value={s.eurusdManual} digits={4} onChange={(v) => set({ eurusdManual: v })} /></Field>
        </div>
        <button onClick={() => confirm("Alle Einstellungen auf Standard zurücksetzen?") && onChange(DEFAULT_SETTINGS)} className={buttonClass}>Standardwerte</button>
      </section>
    </div>
  );
}

function Guard({ label, enabled, onToggle, children }: { label: string; enabled: boolean; onToggle: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg bg-background/70 p-3">
      <Toggle checked={enabled} onChange={onToggle} label={label} />
      <div className={enabled ? "" : "pointer-events-none opacity-40"}>{children}</div>
    </div>
  );
}

export function DataPanel({ store, onReplace }: { store: OsStore; onReplace: (s: OsStore) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const exportJson = () => {
    const blob = new Blob([JSON.stringify(store, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `optionsschein-strategie-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as OsStore;
      if (data.version !== 1 || !Array.isArray(data.positions)) throw new Error("Unbekanntes Format");
      onReplace({ ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings }, candidates: data.candidates ?? [] });
      setMessage(`Importiert: ${data.positions.length} Positionen, ${data.candidates?.length ?? 0} Kandidaten.`);
    } catch (e) {
      setMessage(`Import fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
      <h3 className="font-medium">Daten sichern</h3>
      <p className="text-sm text-muted">
        Alle Positionen, Kandidaten und Einstellungen liegen nur in diesem Browser. Regelmäßig exportieren – die Datei lässt sich auf jedem Gerät wieder importieren.
      </p>
      <div className="flex flex-wrap gap-2">
        <button onClick={exportJson} className={primaryButtonClass}>Als JSON exportieren</button>
        <button onClick={() => file.current?.click()} className={buttonClass}>JSON importieren</button>
        <input ref={file} type="file" accept="application/json,.json" className="hidden" onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        <button onClick={() => confirm("Alle Daten durch die Startdaten ersetzen?") && onReplace(startData())} className={`${buttonClass} text-down`}>Auf Startdaten zurücksetzen</button>
      </div>
      {message && <p className="text-sm">{message}</p>}
    </section>
  );
}
