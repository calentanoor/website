// Option analytics (pure functions, usable on server and client).
//
// Dealer positioning (GEX) uses the common simplification that customers sell
// calls (covered calls, overwriting) and buy puts (protection): dealers are
// then long call gamma (positive GEX) and short put gamma (negative GEX).

export type OptionQuote = {
  strike: number;
  openInterest: number;
  volume: number;
  iv: number; // implied volatility, decimal
  bid?: number;
  ask?: number;
  last?: number;
};

export type Chain = {
  expiration: number; // unix ms (expiry date, market close)
  calls: OptionQuote[];
  puts: OptionQuote[];
};

const YEAR_MS = 365 * 24 * 3600 * 1000;

export function yearsTo(expiration: number, now: number) {
  return Math.max(1 / (365 * 24), (expiration - now) / YEAR_MS);
}

const pdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

// Abramowitz–Stegun approximation of the standard normal CDF
export function cdf(x: number) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

function d1(spot: number, strike: number, t: number, iv: number, rate: number) {
  return (Math.log(spot / strike) + (rate + (iv * iv) / 2) * t) / (iv * Math.sqrt(t));
}

export function gamma(spot: number, strike: number, t: number, iv: number, rate: number) {
  return pdf(d1(spot, strike, t, iv, rate)) / (spot * iv * Math.sqrt(t));
}

export function delta(spot: number, strike: number, t: number, iv: number, rate: number, type: "call" | "put") {
  const n = cdf(d1(spot, strike, t, iv, rate));
  return type === "call" ? n : n - 1;
}

// Yahoo reports placeholder IVs for illiquid strikes; ignore implausible ones.
export const validIv = (q: OptionQuote) => q.iv > 0.01 && q.iv < 3;

export const mid = (q: OptionQuote) =>
  q.bid && q.ask && q.ask >= q.bid ? (q.bid + q.ask) / 2 : q.last ?? undefined;

function nearestStrike(quotes: OptionQuote[], spot: number) {
  return quotes.reduce<OptionQuote | undefined>((best, q) => (!best || Math.abs(q.strike - spot) < Math.abs(best.strike - spot) ? q : best), undefined);
}

export function atmIv(chain: Chain, spot: number): number | undefined {
  const ivs = [nearestStrike(chain.calls.filter(validIv), spot), nearestStrike(chain.puts.filter(validIv), spot)]
    .filter((q): q is OptionQuote => !!q)
    .map((q) => q.iv);
  return ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : undefined;
}

// Price of the at-the-money straddle (call + put at the strike closest to spot)
export function straddle(chain: Chain, spot: number): number | undefined {
  const call = nearestStrike(chain.calls, spot);
  if (!call) return undefined;
  const put = chain.puts.find((p) => p.strike === call.strike);
  const c = mid(call);
  const p = put && mid(put);
  return c != null && p != null ? c + p : undefined;
}

// Strike at which option holders' total payout is smallest
export function maxPain(chain: Chain): number | undefined {
  const strikes = [...new Set([...chain.calls, ...chain.puts].map((q) => q.strike))].sort((a, b) => a - b);
  let best: { strike: number; pain: number } | undefined;
  for (const k of strikes) {
    let pain = 0;
    for (const c of chain.calls) pain += Math.max(0, k - c.strike) * c.openInterest;
    for (const p of chain.puts) pain += Math.max(0, p.strike - k) * p.openInterest;
    if (!best || pain < best.pain) best = { strike: k, pain };
  }
  return best?.strike;
}

export function wall(quotes: OptionQuote[]): number | undefined {
  return quotes.reduce<OptionQuote | undefined>((best, q) => (!best || q.openInterest > best.openInterest ? q : best), undefined)?.strike;
}

const sum = (quotes: OptionQuote[], key: "openInterest" | "volume") => quotes.reduce((a, q) => a + (q[key] || 0), 0);

export function putCallRatio(chain: Chain, key: "openInterest" | "volume") {
  const calls = sum(chain.calls, key);
  return calls ? sum(chain.puts, key) / calls : undefined;
}

// Dollar gamma per 1 % move, per strike, summed over the given chains.
export function gexByStrike(chains: Chain[], spot: number, rate: number, now: number) {
  const byStrike = new Map<number, { call: number; put: number }>();
  for (const chain of chains) {
    const t = yearsTo(chain.expiration, now);
    for (const [quotes, sign] of [[chain.calls, 1], [chain.puts, -1]] as const) {
      for (const q of quotes) {
        if (!q.openInterest || !validIv(q)) continue;
        const g = gamma(spot, q.strike, t, q.iv, rate) * q.openInterest * 100 * spot * spot * 0.01 * sign;
        const entry = byStrike.get(q.strike) ?? { call: 0, put: 0 };
        if (sign > 0) entry.call += g;
        else entry.put += g;
        byStrike.set(q.strike, entry);
      }
    }
  }
  return [...byStrike.entries()].map(([strike, v]) => ({ strike, ...v, net: v.call + v.put })).sort((a, b) => a.strike - b.strike);
}

export function totalGex(chains: Chain[], spot: number, rate: number, now: number) {
  return gexByStrike(chains, spot, rate, now).reduce((a, s) => a + s.net, 0);
}

// Spot level at which dealers' net gamma flips sign (closest to current spot).
export function zeroGamma(chains: Chain[], spot: number, rate: number, now: number): number | undefined {
  const steps = 80;
  const levels = Array.from({ length: steps + 1 }, (_, i) => spot * (0.8 + (0.4 * i) / steps));
  const values = levels.map((s) => totalGex(chains, s, rate, now));
  let best: number | undefined;
  for (let i = 1; i < levels.length; i++) {
    if (Math.sign(values[i]) !== Math.sign(values[i - 1])) {
      const x = levels[i - 1] + ((levels[i] - levels[i - 1]) * -values[i - 1]) / (values[i] - values[i - 1]);
      if (best == null || Math.abs(x - spot) < Math.abs(best - spot)) best = x;
    }
  }
  return best;
}

// Annualised close-to-close volatility over the last n returns
export function realizedVol(closes: number[], n = 20): number | undefined {
  if (closes.length <= n) return undefined;
  const w = closes.slice(-n - 1);
  const r = w.slice(1).map((c, i) => Math.log(c / w[i]));
  const mean = r.reduce((a, b) => a + b, 0) / r.length;
  const variance = r.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.length - 1);
  return Math.sqrt(variance * 252);
}

export function bsPrice(spot: number, strike: number, t: number, iv: number, rate: number, type: "call" | "put") {
  const a = d1(spot, strike, t, iv, rate);
  const b = a - iv * Math.sqrt(t);
  const disc = Math.exp(-rate * t);
  return type === "call" ? spot * cdf(a) - strike * disc * cdf(b) : strike * disc * cdf(-b) - spot * cdf(-a);
}
