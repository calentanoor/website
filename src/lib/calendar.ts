import "server-only";
import YahooFinance from "yahoo-finance2";
import { cacheLife } from "next/cache";
import { INDICES } from "./indices";

export type EventType = "macro" | "centralbank" | "earnings" | "dividend" | "expiry";
export type Impact = "high" | "medium" | "low";

export type CalendarEvent = {
  id: string;
  time: number; // unix ms
  allDay?: boolean;
  type: EventType;
  title: string;
  region: string; // e.g. "USA", "Eurozone", "Deutschland"
  impact?: Impact;
  symbol?: string;
  indices?: string[];
  forecast?: string;
  previous?: string;
  estimated?: boolean;
};

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"], queue: { concurrency: 2 } });
const mockEnabled = () => process.env.MOCK_DATA === "1";
const DAY = 86400000;

// ---------------------------------------------------------------------------
// Macro data: ForexFactory weekly calendar feed (free, current + next week).

const CURRENCY_REGION: Record<string, string> = {
  USD: "USA", EUR: "Eurozone", GBP: "Großbritannien", JPY: "Japan", CNY: "China",
  CHF: "Schweiz", CAD: "Kanada", AUD: "Australien", NZD: "Neuseeland",
};

type FFEvent = { title: string; country: string; date: string; impact: string; forecast?: string; previous?: string };

async function fetchFF(file: string): Promise<FFEvent[]> {
  const res = await fetch(`https://nfs.faireconomy.media/${file}`, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

export async function getMacroEvents(): Promise<{ events: CalendarEvent[]; errors: string[] }> {
  "use cache";
  cacheLife({ stale: 900, revalidate: 3600, expire: 86400 });
  if (mockEnabled()) return { events: mockMacro(), errors: [] };

  const errors: string[] = [];
  const weeks = await Promise.all(
    ["ff_calendar_thisweek.json", "ff_calendar_nextweek.json"].map((f) =>
      fetchFF(f).catch((e) => {
        errors.push(e instanceof Error ? e.message : String(e));
        return [] as FFEvent[];
      }),
    ),
  );
  const events = weeks.flat().flatMap((e, i): CalendarEvent[] => {
    const impact = e.impact?.toLowerCase();
    if (impact !== "high" && impact !== "medium" && impact !== "low") return []; // skips holidays
    const region = e.country === "EUR" && /^German/i.test(e.title) ? "Deutschland" : CURRENCY_REGION[e.country] ?? e.country;
    return [{
      id: `ff-${i}-${e.date}-${e.title}`,
      time: new Date(e.date).getTime(),
      type: "macro",
      title: e.title,
      region,
      impact,
      forecast: e.forecast || undefined,
      previous: e.previous || undefined,
    }];
  });
  return { events, errors };
}

// ---------------------------------------------------------------------------
// Central bank decisions – maintained by hand (official 2026 schedules).

const FOMC_2026 = ["2026-01-28T19:00Z", "2026-03-18T18:00Z", "2026-04-29T18:00Z", "2026-06-17T18:00Z", "2026-07-29T18:00Z", "2026-09-16T18:00Z", "2026-10-28T18:00Z", "2026-12-09T19:00Z"];
const ECB_2026 = ["2026-02-05T13:15Z", "2026-03-19T13:15Z", "2026-04-30T12:15Z", "2026-06-11T12:15Z", "2026-07-23T12:15Z", "2026-09-10T12:15Z", "2026-10-29T13:15Z", "2026-12-17T13:15Z"];

export function getCentralBankEvents(): CalendarEvent[] {
  return [
    ...FOMC_2026.map((d) => ({ id: `fomc-${d}`, time: Date.parse(d), type: "centralbank" as const, title: "Fed-Zinsentscheid (FOMC)", region: "USA", impact: "high" as const })),
    ...ECB_2026.map((d) => ({ id: `ecb-${d}`, time: Date.parse(d), type: "centralbank" as const, title: "EZB-Zinsentscheid", region: "Eurozone", impact: "high" as const })),
  ];
}

// ---------------------------------------------------------------------------
// Options expiries: third Friday of every month, quarterly ones are "witching".

function thirdFriday(year: number, month: number) {
  const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
  return new Date(Date.UTC(year, month, 1 + ((5 - first + 7) % 7) + 14, 12));
}

export function getExpiryEvents(from: number, months = 12): CalendarEvent[] {
  const start = new Date(from);
  return Array.from({ length: months + 1 }, (_, i) => {
    const d = thirdFriday(start.getUTCFullYear(), start.getUTCMonth() + i);
    const quarterly = d.getUTCMonth() % 3 === 2;
    return {
      id: `opex-${d.toISOString()}`,
      time: d.getTime(),
      allDay: true,
      type: "expiry" as const,
      title: quarterly ? "Großer Verfall (Hexensabbat): Optionen & Futures" : "Monatlicher Optionsverfall",
      region: "USA / Eurozone",
      impact: quarterly ? ("high" as const) : ("medium" as const),
    };
  }).filter((e) => e.time >= from - DAY);
}

// ---------------------------------------------------------------------------
// Company events for all index members, via batched quote requests.

const toMs = (v: unknown): number | undefined =>
  v instanceof Date ? v.getTime() : typeof v === "number" ? (v < 1e11 ? v * 1000 : v) : typeof v === "string" ? Date.parse(v) || undefined : undefined;

export async function getCompanyEvents(): Promise<{ events: CalendarEvent[]; errors: string[] }> {
  "use cache";
  cacheLife({ stale: 900, revalidate: 3600, expire: 86400 });

  const membership = new Map<string, string[]>();
  for (const index of INDICES) for (const s of index.constituents ?? []) membership.set(s, [...(membership.get(s) ?? []), index.id]);
  const symbols = [...membership.keys()];
  if (mockEnabled()) return { events: mockCompany(symbols, membership), errors: [] };

  const errors: string[] = [];
  const chunks = Array.from({ length: Math.ceil(symbols.length / 50) }, (_, i) => symbols.slice(i * 50, i * 50 + 50));
  const quotes = (
    await Promise.all(
      chunks.map((chunk) =>
        yahooFinance
          .quote(chunk, { fields: ["symbol", "shortName", "longName", "earningsTimestamp", "earningsTimestampStart", "isEarningsDateEstimate", "dividendDate"] }, { validateResult: false })
          .then((r) => (Array.isArray(r) ? (r as Record<string, unknown>[]) : []))
          .catch((e) => {
            errors.push(e instanceof Error ? e.message : String(e));
            return [] as Record<string, unknown>[];
          }),
      ),
    )
  ).flat();

  const events: CalendarEvent[] = [];
  for (const q of quotes) {
    const symbol = String(q.symbol);
    const name = String(q.shortName ?? q.longName ?? symbol);
    const indices = membership.get(symbol);
    const earnings = toMs(q.earningsTimestamp) ?? toMs(q.earningsTimestampStart);
    if (earnings) events.push({ id: `earn-${symbol}-${earnings}`, time: earnings, type: "earnings", title: `Quartalszahlen ${name}`, region: regionOf(symbol), symbol, indices, estimated: q.isEarningsDateEstimate === true });
    const dividend = toMs(q.dividendDate);
    if (dividend) events.push({ id: `div-${symbol}-${dividend}`, time: dividend, allDay: true, type: "dividend", title: `Dividendenzahlung ${name}`, region: regionOf(symbol), symbol, indices });
  }
  return { events, errors };
}

function regionOf(symbol: string) {
  if (symbol.endsWith(".DE")) return "Deutschland";
  return symbol.includes(".") ? "Eurozone" : "USA";
}

// ---------------------------------------------------------------------------
// Mock data (MOCK_DATA=1)

const MOCK_MACRO: [string, string, Impact][] = [
  ["USD", "Non-Farm Employment Change", "high"], ["USD", "CPI m/m", "high"], ["EUR", "German ifo Business Climate", "medium"],
  ["EUR", "Flash Manufacturing PMI", "medium"], ["USD", "Unemployment Claims", "medium"], ["USD", "Retail Sales m/m", "high"],
  ["EUR", "German ZEW Economic Sentiment", "medium"], ["GBP", "GDP m/m", "medium"], ["JPY", "BOJ Policy Rate", "high"], ["USD", "Crude Oil Inventories", "low"],
];

function mockMacro(): CalendarEvent[] {
  const base = Date.UTC(2026, 9, 5, 12, 30);
  return MOCK_MACRO.flatMap(([cur, title, impact], i) =>
    [0, 7].map((w) => ({
      id: `mock-${i}-${w}`,
      time: base + ((i * 37) % 5 + w) * DAY + (i % 3) * 3600000,
      type: "macro" as const,
      title,
      region: cur === "EUR" && title.startsWith("German") ? "Deutschland" : CURRENCY_REGION[cur],
      impact,
      forecast: "0.3%",
      previous: "0.2%",
    })),
  );
}

function mockCompany(symbols: string[], membership: Map<string, string[]>): CalendarEvent[] {
  const base = Date.UTC(2026, 9, 8, 6);
  return symbols.map((symbol, i) => ({
    id: `mock-earn-${symbol}`,
    time: base + ((i * 7) % 60) * DAY,
    type: "earnings" as const,
    title: `Quartalszahlen ${symbol.split(".")[0]} Demo AG`,
    region: regionOf(symbol),
    symbol,
    indices: membership.get(symbol),
    estimated: i % 3 === 0,
  }));
}
