"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import type { CalendarEvent, EventType, Impact } from "@/lib/calendar";
import { useWatchlist } from "@/lib/storage";

const TYPES: { key: EventType; label: string; color: string }[] = [
  { key: "macro", label: "Konjunktur", color: "bg-accent" },
  { key: "centralbank", label: "Notenbank", color: "bg-[#8b6cf6]" },
  { key: "earnings", label: "Quartalszahlen", color: "bg-up" },
  { key: "dividend", label: "Dividende", color: "bg-neutral" },
  { key: "expiry", label: "Optionsverfall", color: "bg-down" },
];

const IMPACTS: { key: Impact; label: string }[] = [
  { key: "high", label: "hoch" },
  { key: "medium", label: "mittel" },
  { key: "low", label: "niedrig" },
];

const RANGES = [
  { key: "week", label: "Diese Woche" },
  { key: "next", label: "Nächste Woche" },
  { key: "30", label: "30 Tage" },
  { key: "90", label: "90 Tage" },
  { key: "past", label: "Letzte 7 Tage" },
] as const;

type RangeKey = (typeof RANGES)[number]["key"];

const DAY = 86400000;

function startOfWeek(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function rangeBounds(range: RangeKey, now: number): [number, number] {
  const today = new Date(now).setHours(0, 0, 0, 0);
  const week = startOfWeek(now);
  switch (range) {
    case "week":
      return [week, week + 7 * DAY];
    case "next":
      return [week + 7 * DAY, week + 14 * DAY];
    case "30":
      return [today, today + 30 * DAY];
    case "90":
      return [today, today + 90 * DAY];
    case "past":
      return [today - 7 * DAY, now];
  }
}

// Days and times use the viewer's timezone, so the event list renders on the client only.
const useIsClient = () => useSyncExternalStore(() => () => {}, () => true, () => false);

const impactDots = { high: 3, medium: 2, low: 1 };

export function CalendarView({ events, now, errors, indices }: { events: CalendarEvent[]; now: number; errors: string[]; indices: { id: string; name: string }[] }) {
  const isClient = useIsClient();
  const watchlist = useWatchlist();
  const [range, setRange] = useState<RangeKey>("week");
  const [types, setTypes] = useState<EventType[]>(TYPES.map((t) => t.key));
  const [impacts, setImpacts] = useState<Impact[]>(["high", "medium"]);
  const [regions, setRegions] = useState<string[]>([]);
  const [index, setIndex] = useState("all");
  const [onlyWatchlist, setOnlyWatchlist] = useState(false);

  const allRegions = useMemo(() => [...new Set(events.map((e) => e.region))].sort(), [events]);

  const filtered = useMemo(() => {
    const [from, to] = rangeBounds(range, now);
    return events.filter((e) => {
      if (e.time < from || e.time >= to || !types.includes(e.type)) return false;
      if (regions.length && !regions.includes(e.region)) return false;
      const company = e.type === "earnings" || e.type === "dividend";
      if (!company && e.impact && !impacts.includes(e.impact)) return false;
      if (company && index !== "all" && !e.indices?.includes(index)) return false;
      if (onlyWatchlist && company && !watchlist.has(e.symbol ?? "")) return false;
      if (onlyWatchlist && !company && e.type !== "centralbank") return false;
      return true;
    });
  }, [events, range, now, types, regions, impacts, index, onlyWatchlist, watchlist]);

  const days = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filtered) {
      const d = new Date(e.time);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.values()];
  }, [filtered]);

  const toggle = <T,>(list: T[], item: T, set: (v: T[]) => void) => set(list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);
  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ring-1 ring-inset transition-colors ${active ? "bg-accent/10 text-accent ring-accent/40" : "text-muted ring-border hover:text-foreground"}`;
  const todayKey = new Date(now).toDateString();

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-border bg-surface p-4 shadow-sm">
        <FilterRow label="Zeitraum">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} className={chip(range === r.key)}>{r.label}</button>
          ))}
        </FilterRow>
        <FilterRow label="Art">
          {TYPES.map((t) => (
            <button key={t.key} onClick={() => toggle(types, t.key, setTypes)} className={`${chip(types.includes(t.key))} inline-flex items-center gap-1.5`}>
              <span className={`size-2 rounded-full ${t.color}`} />
              {t.label}
            </button>
          ))}
        </FilterRow>
        <FilterRow label="Wichtigkeit">
          {IMPACTS.map((i) => (
            <button key={i.key} onClick={() => toggle(impacts, i.key, setImpacts)} className={chip(impacts.includes(i.key))}>{i.label}</button>
          ))}
        </FilterRow>
        <FilterRow label="Region">
          {allRegions.map((r) => (
            <button key={r} onClick={() => toggle(regions, r, setRegions)} className={chip(regions.includes(r))}>{r}</button>
          ))}
          {regions.length > 0 && <button onClick={() => setRegions([])} className="text-xs text-muted hover:text-foreground">zurücksetzen</button>}
        </FilterRow>
        <FilterRow label="Unternehmen">
          <select value={index} onChange={(e) => setIndex(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-sm">
            <option value="all">alle Indizes</option>
            {indices.map((i) => (
              <option key={i.id} value={i.id}>{i.name}</option>
            ))}
          </select>
          <button onClick={() => setOnlyWatchlist((v) => !v)} className={chip(onlyWatchlist)}>★ nur Watchlist</button>
        </FilterRow>
      </section>

      {errors.length > 0 && (
        <div className="rounded-lg border border-down/30 bg-down/5 px-4 py-2 text-xs text-down">
          {errors.map((e) => <div key={e}>{e}</div>)}
        </div>
      )}

      <p className="text-sm text-muted">
        <span className="font-medium text-foreground">{filtered.length}</span> Termine
        {(range === "30" || range === "90") && " · Konjunkturdaten sind nur für diese und nächste Woche verfügbar"}
      </p>

      {!isClient ? (
        <div className="h-40 animate-pulse rounded-xl bg-border/40" />
      ) : days.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted">Keine Termine für diese Filter.</div>
      ) : (
        <div className="space-y-4">
          {days.map((dayEvents) => {
            const d = new Date(dayEvents[0].time);
            const isToday = d.toDateString() === todayKey;
            return (
              <section key={d.toDateString()} className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
                <h2 className={`flex items-center gap-2 border-b border-border px-4 py-2 text-sm font-medium ${isToday ? "bg-accent/10 text-accent" : "bg-background/60"}`}>
                  {d.toLocaleDateString("de-DE", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                  {isToday && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] text-white">Heute</span>}
                </h2>
                <ul className="divide-y divide-border/60">
                  {dayEvents.map((e) => (
                    <EventRow key={e.id} event={e} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-muted">{label}</span>
      {children}
    </div>
  );
}

// Rendered only on the client (see isClient above), so local time formatting is safe.
function EventRow({ event: e }: { event: CalendarEvent }) {
  const type = TYPES.find((t) => t.key === e.type)!;
  const time = e.allDay ? "ganztägig" : new Date(e.time).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
  return (
    <li className="flex items-center gap-4 px-4 py-2.5 text-sm">
      <span className="w-20 shrink-0 tabular-nums text-muted">{time}</span>
      <span className={`size-2 shrink-0 rounded-full ${type.color}`} title={type.label} />
      <div className="min-w-0 flex-1">
        <div className="truncate">
          {e.symbol ? (
            <Link href={`/stock/${encodeURIComponent(e.symbol)}`} className="hover:text-accent">{e.title}</Link>
          ) : (
            e.title
          )}
          {e.estimated && <span className="ml-2 text-xs text-muted">(geschätzt)</span>}
        </div>
        <div className="text-xs text-muted">
          {type.label} · {e.region}
          {e.symbol && <span className="font-mono"> · {e.symbol}</span>}
        </div>
      </div>
      {(e.forecast || e.previous) && (
        <div className="hidden shrink-0 text-right text-xs tabular-nums sm:block">
          {e.forecast && <div>Prognose <span className="font-medium">{e.forecast}</span></div>}
          {e.previous && <div className="text-muted">Vorher {e.previous}</div>}
        </div>
      )}
      {e.impact && (
        <span className="flex w-10 shrink-0 justify-end gap-0.5" title={`Wichtigkeit: ${IMPACTS.find((i) => i.key === e.impact)?.label}`}>
          {[1, 2, 3].map((n) => (
            <span key={n} className={`h-3 w-1.5 rounded-sm ${n <= impactDots[e.impact!] ? (e.impact === "high" ? "bg-down" : e.impact === "medium" ? "bg-neutral" : "bg-muted") : "bg-border"}`} />
          ))}
        </span>
      )}
    </li>
  );
}
