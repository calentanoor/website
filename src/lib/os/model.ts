// Black-Scholes model for classic call warrants (pure functions).
// All results are model estimates; values from the issuer's data sheet take
// precedence wherever they are available.

export type ModelInput = {
  S: number; // share price (USD)
  K: number; // strike (USD)
  T: number; // time to expiry in years
  sigma: number; // implied volatility, decimal
  r: number; // interest rate, decimal
  q?: number; // dividend yield, decimal
};

const SQRT2 = Math.SQRT2;

// erf with max. error ~1.5e-7 (Abramowitz–Stegun 7.1.26)
function erf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

export const normCdf = (x: number) => 0.5 * (1 + erf(x / SQRT2));
export const normPdf = (x: number) => Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);

function d1d2({ S, K, T, sigma, r, q = 0 }: ModelInput) {
  const d1 = (Math.log(S / K) + (r - q + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  return { d1, d2: d1 - sigma * Math.sqrt(T) };
}

// Call value per share (USD)
export function callPrice(m: ModelInput): number {
  const { S, K, T, r, q = 0 } = m;
  if (T <= 0 || m.sigma <= 0) return Math.max(0, S - K);
  const { d1, d2 } = d1d2(m);
  return S * Math.exp(-q * T) * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
}

export function callDelta(m: ModelInput): number {
  if (m.T <= 0 || m.sigma <= 0) return m.S > m.K ? 1 : 0;
  return Math.exp(-(m.q ?? 0) * m.T) * normCdf(d1d2(m).d1);
}

// Effective leverage: % change of the call per 1 % in the share
export function omega(m: ModelInput): number {
  const c = callPrice(m);
  return c > 0 ? (callDelta(m) * m.S) / c : NaN;
}

// Change of the call in % of its price per 1 volatility point
export function vegaPct(m: ModelInput): number {
  const c = callPrice(m);
  if (c <= 0 || m.T <= 0) return NaN;
  const { d1 } = d1d2(m);
  return ((m.S * Math.exp(-(m.q ?? 0) * m.T) * normPdf(d1) * Math.sqrt(m.T) * 0.01) / c) * 100;
}

// Value change in % after `dt` years with unchanged share price and volatility
export function timeDecayPct(m: ModelInput, dt: number): number {
  const c = callPrice(m);
  return c > 0 ? (callPrice({ ...m, T: Math.max(0, m.T - dt) }) / c - 1) * 100 : NaN;
}

// Value change in % for a volatility change of `points` (e.g. -3)
export function volShiftPct(m: ModelInput, points: number): number {
  const c = callPrice(m);
  return c > 0 ? (callPrice({ ...m, sigma: Math.max(0.01, m.sigma + points / 100) }) / c - 1) * 100 : NaN;
}

// Warrant price in EUR from the call value per share
export const warrantPriceEur = (callUsd: number, ratio: number, eurusd: number) => (callUsd * ratio) / eurusd;
export const callFromWarrantEur = (priceEur: number, ratio: number, eurusd: number) => (priceEur * eurusd) / ratio;

function bisect(f: (x: number) => number, lo: number, hi: number, iterations = 100): number | undefined {
  let flo = f(lo);
  const fhi = f(hi);
  if (!Number.isFinite(flo) || !Number.isFinite(fhi) || flo * fhi > 0) return undefined;
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-10) return mid;
    if (flo * fm < 0) {
      hi = mid;
    } else {
      lo = mid;
      flo = fm;
    }
  }
  return (lo + hi) / 2;
}

// Implied volatility from a call value per share (USD)
export function impliedVol(callUsd: number, m: Omit<ModelInput, "sigma">): number | undefined {
  if (!(callUsd > 0) || m.T <= 0) return undefined;
  return bisect((s) => callPrice({ ...m, sigma: s }) - callUsd, 0.001, 5);
}

// Share price S' at which the call is worth `factor` × today's value after
// `dt` years (same volatility). Returned as % change of the share price.
export function requiredMovePct(m: ModelInput, factor: number, dt: number): number | undefined {
  const target = callPrice(m) * factor;
  const T = Math.max(1 / 365, m.T - dt);
  const s = bisect((x) => callPrice({ ...m, T, S: x }) - target, m.S * 0.2, m.S * 10);
  return s == null ? undefined : (s / m.S - 1) * 100;
}

export const yearsBetween = (fromMs: number, toMs: number) => (toMs - fromMs) / (365.25 * 86400000);
