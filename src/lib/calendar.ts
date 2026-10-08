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
  actual?: string;
  // Company earnings: reported vs. expected earnings per share
  epsActual?: number;
  epsEstimate?: number;
  surprisePercent?: number;
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
  // The next-week file is only published towards the end of the week.
  if (res.status === 404 && file.includes("nextweek")) return [];
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return res.json();
}

export async function getMacroEvents(): Promise<{ events: CalendarEvent[]; errors: string[] }> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86400 });
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

  try {
    await addActuals(events);
  } catch (e) {
    errors.push(`Ist-Werte (Nasdaq): ${e instanceof Error ? e.message : String(e)}`);
  }
  return { events, errors };
}

// ---------------------------------------------------------------------------
// Actual values for past macro releases: the ForexFactory feed has none, so
// they are taken from Nasdaq's economic calendar and matched by country, time
// and title similarity.

type NasdaqRow = { gmt?: string; country?: string; eventName?: string; actual?: string; consensus?: string; previous?: string };

const NASDAQ_COUNTRY: Record<string, string> = {
  "United States": "USA", "Euro Zone": "Eurozone", Germany: "Deutschland", France: "Frankreich", Italy: "Italien",
  Spain: "Spanien", "United Kingdom": "Großbritannien", Japan: "Japan", China: "China", Switzerland: "Schweiz",
  Canada: "Kanada", Australia: "Australien", "New Zealand": "Neuseeland",
};

async function getNasdaqDay(date: string, past: boolean): Promise<NasdaqRow[]> {
  "use cache";
  // Finished days hardly change any more; today's values arrive during the day.
  cacheLife(past ? { stale: 3600, revalidate: 86400, expire: 7 * 86400 } : { stale: 300, revalidate: 900, expire: 86400 });
  const res = await fetch(`https://api.nasdaq.com/api/calendar/economicevents?date=${date}`, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      Origin: "https://www.nasdaq.com",
      Referer: "https://www.nasdaq.com/",
    },
  });
  if (!res.ok) throw new Error(`${date}: HTTP ${res.status}`);
  const body = await res.json();
  return (body?.data?.rows ?? []) as NasdaqRow[];
}

const SYNONYMS: Record<string, string> = { "m/m": "mom", "y/y": "yoy", "q/q": "qoq", "(mom)": "mom", "(yoy)": "yoy", "(qoq)": "qoq" };
const STOP = new Set(["german", "french", "italian", "spanish", "the", "of", "and", "s", "sa", "nsa"]);

function tokens(title: string) {
  return new Set(
    title
      .toLowerCase()
      .replace(/non-?farm (employment change|payrolls)/, "nonfarm payrolls")
      .replace(/unemployment claims/, "jobless claims")
      .split(/\s+/)
      .map((t) => SYNONYMS[t] ?? t)
      .flatMap((t) => t.replace(/[^a-z0-9]+/g, " ").trim().split(" "))
      .filter((t) => t && !STOP.has(t)),
  );
}

function similarity(a: string, b: string) {
  const ta = tokens(a);
  const tb = tokens(b);
  let common = 0;
  ta.forEach((t) => tb.has(t) && common++);
  return common / Math.max(1, Math.min(ta.size, tb.size));
}

// Country of a ForexFactory event in Nasdaq's naming (EUR covers several countries).
function ffCountry(e: CalendarEvent) {
  if (e.region !== "Eurozone" && e.region !== "Deutschland") return e.region;
  const prefix = /^(German|French|Italian|Spanish)\b/i.exec(e.title)?.[1]?.toLowerCase();
  return { german: "Deutschland", french: "Frankreich", italian: "Italien", spanish: "Spanien" }[prefix ?? ""] ?? "Eurozone";
}

async function addActuals(events: CalendarEvent[]) {
  const now = Date.now();
  const past = events.filter((e) => e.time <= now);
  const dates = [...new Set(past.map((e) => new Date(e.time).toISOString().slice(0, 10)))];
  const today = new Date(now).toISOString().slice(0, 10);

  const days = await Promise.all(dates.map((d) => getNasdaqDay(d, d < today).then((rows) => ({ d, rows }))));
  const candidates = days.flatMap(({ d, rows }) =>
    rows.flatMap((r) => {
      const actual = r.actual?.replace(/&nbsp;/g, "").trim();
      const hm = /^(\d{1,2}):(\d{2})$/.exec(r.gmt ?? "");
      if (!actual || !hm || !r.eventName) return [];
      const [y, m, day] = d.split("-").map(Number);
      return [{ time: Date.UTC(y, m - 1, day, Number(hm[1]), Number(hm[2])), region: NASDAQ_COUNTRY[r.country ?? ""] ?? r.country, title: r.eventName, actual }];
    }),
  );

  for (const e of past) {
    const country = ffCountry(e);
    let best: { score: number; actual: string } | undefined;
    for (const c of candidates) {
      if (c.region !== country || Math.abs(c.time - e.time) > 90 * 60000) continue;
      const score = similarity(e.title, c.title);
      if (score >= 0.5 && (!best || score > best.score)) best = { score, actual: c.actual };
    }
    if (best) e.actual = best.actual;
  }
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
  await addEarningsResults(events, errors);
  return { events, errors };
}

async function getEarningsHistory(symbol: string) {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 6 * 3600, expire: 7 * 86400 });
  const res = await yahooFinance.quoteSummary(symbol, { modules: ["earningsHistory"] });
  return (res.earningsHistory?.history ?? []).map((h) => ({
    quarter: h.quarter?.getTime(),
    epsActual: h.epsActual ?? undefined,
    epsEstimate: h.epsEstimate ?? undefined,
    surprisePercent: h.surprisePercent ?? undefined,
  }));
}

// For earnings reported in the last 10 days, attach the latest quarter's EPS
// result (its fiscal quarter must have ended shortly before the report).
async function addEarningsResults(events: CalendarEvent[], errors: string[]) {
  const now = Date.now();
  const recent = events.filter((e) => e.type === "earnings" && e.symbol && e.time <= now && e.time >= now - 10 * DAY);
  let failed = 0;
  await Promise.all(
    recent.map(async (e) => {
      try {
        const history = await getEarningsHistory(e.symbol!);
        const latest = history.filter((h) => h.quarter && h.quarter < e.time && h.quarter > e.time - 120 * DAY && h.epsActual != null).at(-1);
        if (!latest) return;
        e.epsActual = latest.epsActual;
        e.epsEstimate = latest.epsEstimate;
        e.surprisePercent = latest.surprisePercent != null ? latest.surprisePercent * 100 : undefined;
      } catch {
        failed++;
      }
    }),
  );
  if (failed) errors.push(`EPS-Ergebnisse: ${failed} von ${recent.length} Abrufen fehlgeschlagen`);
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
      actual: base + ((i * 37) % 5 + w) * DAY < Date.UTC(2026, 9, 8, 12) ? ["0.5%", "0.1%", "0.3%"][i % 3] : undefined,
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
    ...(i % 4 === 0 ? { time: base - ((i % 6) + 1) * DAY, estimated: false, epsActual: 1.2 + (i % 5) / 10, epsEstimate: 1.3, surprisePercent: ((1.2 + (i % 5) / 10) / 1.3 - 1) * 100 } : {}),
  }));
}
