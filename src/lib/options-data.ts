import "server-only";
import YahooFinance from "yahoo-finance2";
import { cacheLife } from "next/cache";
import { getChart } from "./market-data";
import {
  atmIv,
  gexByStrike,
  maxPain,
  putCallRatio,
  realizedVol,
  straddle,
  wall,
  yearsTo,
  zeroGamma,
  type Chain,
  type OptionQuote,
} from "./options-math";
import type { Candle } from "./types";

const yahooFinance = new YahooFinance({ suppressNotices: ["yahooSurvey"], queue: { concurrency: 3 } });
const mockEnabled = () => process.env.MOCK_DATA === "1";

const DAY = 86400000;
// Yahoo reports expirations as 00:00 UTC; US options stop trading 16:00 ET.
const CLOSE_OFFSET = 20 * 3600 * 1000;
const RATE_FALLBACK = 0.04;
// Expirations used for GEX: dealer hedging is dominated by near-term gamma.
const GEX_HORIZON_DAYS = 60;

export type ExpirySummary = {
  expiration: number;
  dte: number;
  atmIv?: number;
  straddle?: number;
  moveIv?: number; // 1σ expected move from ATM IV (absolute)
  moveStraddle?: number; // ≈ 0.85 × straddle
  maxPain?: number;
  callWall?: number;
  putWall?: number;
  pcrOi?: number;
  pcrVolume?: number;
  callOi: number;
  putOi: number;
};

export type OptionsAnalysis = {
  symbol: string;
  name: string;
  currency: string;
  spot: number;
  rate: number;
  now: number;
  realizedVol?: number;
  expiries: ExpirySummary[];
  chains: Chain[];
  gex: { byStrike: { strike: number; call: number; put: number; net: number }[]; total: number; zeroGamma?: number };
  candles: Candle[];
};

type RawChain = { spot: number; name: string; currency: string; expirations: number[]; chain?: Chain };

function toQuotes(list: { strike: number; openInterest?: number; volume?: number; impliedVolatility: number; bid?: number; ask?: number; lastPrice: number }[]): OptionQuote[] {
  return list.map((q) => ({
    strike: q.strike,
    openInterest: q.openInterest ?? 0,
    volume: q.volume ?? 0,
    iv: q.impliedVolatility,
    bid: q.bid,
    ask: q.ask,
    last: q.lastPrice,
  }));
}

async function fetchChain(symbol: string, date?: number): Promise<RawChain> {
  "use cache";
  cacheLife({ stale: 300, revalidate: 900, expire: 86400 });
  const res = await yahooFinance.options(symbol, date ? { date: new Date(date) } : {});
  const option = res.options[0];
  return {
    spot: res.quote.regularMarketPrice ?? NaN,
    name: String(res.quote.longName ?? res.quote.shortName ?? symbol),
    currency: res.quote.currency ?? "USD",
    expirations: res.expirationDates.map((d) => d.getTime()),
    chain: option && {
      expiration: option.expirationDate.getTime() + CLOSE_OFFSET,
      calls: toQuotes(option.calls),
      puts: toQuotes(option.puts),
    },
  };
}

async function riskFreeRate(): Promise<number> {
  "use cache";
  cacheLife({ stale: 3600, revalidate: 6 * 3600, expire: 7 * 86400 });
  try {
    const q = await yahooFinance.quote("^IRX"); // 13-week T-bill yield in percent
    return q.regularMarketPrice ? q.regularMarketPrice / 100 : RATE_FALLBACK;
  } catch {
    return RATE_FALLBACK;
  }
}

// All expirations within 45 days (max 8) plus one near each longer horizon.
function pickExpirations(expirations: number[], now: number) {
  const dte = (e: number) => (e + CLOSE_OFFSET - now) / DAY;
  const future = expirations.filter((e) => dte(e) > 0).sort((a, b) => a - b);
  const picked = new Set(future.filter((e) => dte(e) <= 45).slice(0, 8));
  for (const target of [60, 90, 120, 180, 270, 365]) {
    const best = future.reduce<number | undefined>((b, e) => (b == null || Math.abs(dte(e) - target) < Math.abs(dte(b) - target) ? e : b), undefined);
    if (best != null && Math.abs(dte(best) - target) < target * 0.35) picked.add(best);
  }
  return [...picked].sort((a, b) => a - b);
}

export async function getOptionsAnalysis(symbol: string, now: number): Promise<OptionsAnalysis> {
  const [{ base, chains }, rate, candles] = await Promise.all([
    loadChains(symbol, now),
    mockEnabled() ? RATE_FALLBACK : riskFreeRate(),
    getChart(symbol, "1y").catch(() => [] as Candle[]),
  ]);
  const spot = Number.isFinite(base.spot) ? base.spot : candles.at(-1)?.close ?? NaN;

  // Keep strikes within ±40 % of spot – far wings carry no information here.
  const trimmed = chains.map((c) => ({
    ...c,
    calls: c.calls.filter((q) => Math.abs(q.strike / spot - 1) <= 0.4),
    puts: c.puts.filter((q) => Math.abs(q.strike / spot - 1) <= 0.4),
  }));

  const expiries = trimmed.map((c): ExpirySummary => {
    const iv = atmIv(c, spot);
    const t = yearsTo(c.expiration, now);
    const s = straddle(c, spot);
    return {
      expiration: c.expiration,
      dte: Math.max(0, (c.expiration - now) / DAY),
      atmIv: iv,
      straddle: s,
      moveIv: iv != null ? spot * iv * Math.sqrt(t) : undefined,
      moveStraddle: s != null ? s * 0.85 : undefined,
      maxPain: maxPain(c),
      callWall: wall(c.calls),
      putWall: wall(c.puts),
      pcrOi: putCallRatio(c, "openInterest"),
      pcrVolume: putCallRatio(c, "volume"),
      callOi: c.calls.reduce((a, q) => a + q.openInterest, 0),
      putOi: c.puts.reduce((a, q) => a + q.openInterest, 0),
    };
  });

  const nearTerm = trimmed.filter((c) => c.expiration - now <= GEX_HORIZON_DAYS * DAY);
  const byStrike = gexByStrike(nearTerm, spot, rate, now);

  return {
    symbol,
    name: base.name,
    currency: base.currency,
    spot,
    rate,
    now,
    realizedVol: realizedVol(candles.map((c) => c.close)),
    expiries,
    chains: trimmed,
    gex: { byStrike, total: byStrike.reduce((a, s) => a + s.net, 0), zeroGamma: zeroGamma(nearTerm, spot, rate, now) },
    candles: candles.slice(-260),
  };
}

async function loadChains(symbol: string, now: number) {
  if (mockEnabled()) return mockChains(symbol, now);
  const base = await fetchChain(symbol);
  if (!base.expirations.length) throw new Error(`Keine Optionsdaten für ${symbol} bei Yahoo verfügbar`);
  const chains = (await Promise.all(pickExpirations(base.expirations, now).map((e) => fetchChain(symbol, e).then((r) => r.chain))))
    .filter((c): c is Chain => !!c && c.calls.length + c.puts.length > 0);
  return { base, chains };
}

// ---------------------------------------------------------------------------
// Mock data (MOCK_DATA=1): smile-shaped IVs and OI clustered at round strikes.

async function mockChains(symbol: string, now: number): Promise<{ base: RawChain; chains: Chain[] }> {
  const candles = await getChart(symbol, "1y");
  const spot = candles.at(-1)?.close ?? 100;
  const step = spot > 500 ? 10 : spot > 100 ? 5 : 1;
  const firstFriday = now + ((5 - new Date(now).getUTCDay() + 7) % 7) * DAY;
  const expirations = [...Array.from({ length: 6 }, (_, i) => firstFriday + i * 7 * DAY), ...[49, 77, 105, 168, 259, 357].map((d) => firstFriday + d * DAY)].map(
    (e) => Math.floor(e / DAY) * DAY,
  );
  const chains = expirations.map((exp, i): Chain => {
    const t = yearsTo(exp + CLOSE_OFFSET, now);
    const strikes = Array.from({ length: 61 }, (_, k) => Math.round(spot / step) * step + (k - 30) * step);
    const quote = (strike: number, type: "call" | "put"): OptionQuote => {
      const m = strike / spot - 1;
      const iv = 0.24 + 0.02 * i ** 0.5 - 0.35 * m + 1.2 * m * m;
      const round = strike % (step * 5) === 0 ? 3 : 1;
      const center = type === "call" ? spot * 1.05 : spot * 0.93;
      const oi = Math.round(round * 4000 * Math.exp(-(((strike - center) / (spot * 0.06)) ** 2)) / (1 + i * 0.3));
      const intrinsic = Math.max(0, type === "call" ? spot - strike : strike - spot);
      const price = intrinsic + spot * iv * Math.sqrt(t) * 0.4 * Math.exp(-((m / (iv * Math.sqrt(t) + 0.02)) ** 2) / 2);
      return { strike, openInterest: oi, volume: Math.round(oi * 0.15), iv, bid: price * 0.97, ask: price * 1.03, last: price };
    };
    return { expiration: exp + CLOSE_OFFSET, calls: strikes.map((k) => quote(k, "call")), puts: strikes.map((k) => quote(k, "put")) };
  });
  return { base: { spot, name: `${symbol} Demo`, currency: "USD", expirations }, chains };
}
