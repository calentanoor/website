// Technical indicators on plain number arrays (oldest value first).
// Each function returns an array aligned with the input; positions without
// enough history are NaN.

export function sma(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

// Wilder's RSI
export function rsi(values: number[], period = 14): number[] {
  const out = new Array<number>(values.length).fill(NaN);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = ema(values, fast);
  const emaSlow = ema(values, slow);
  const line = values.map((_, i) => emaFast[i] - emaSlow[i]);
  const firstValid = line.findIndex((v) => !Number.isNaN(v));
  const signalLine = new Array<number>(values.length).fill(NaN);
  if (firstValid >= 0) {
    const sig = ema(line.slice(firstValid), signal);
    sig.forEach((v, i) => (signalLine[firstValid + i] = v));
  }
  const histogram = line.map((v, i) => v - signalLine[i]);
  return { line, signal: signalLine, histogram };
}

export function atr(high: number[], low: number[], close: number[], period = 14): number[] {
  const tr = close.map((c, i) =>
    i === 0
      ? high[i] - low[i]
      : Math.max(high[i] - low[i], Math.abs(high[i] - close[i - 1]), Math.abs(low[i] - close[i - 1])),
  );
  return sma(tr, period);
}

export function bollingerWidth(values: number[], period = 20, mult = 2): number[] {
  const mid = sma(values, period);
  return values.map((_, i) => {
    if (i < period - 1) return NaN;
    const slice = values.slice(i - period + 1, i + 1);
    const mean = mid[i];
    const sd = Math.sqrt(slice.reduce((a, v) => a + (v - mean) ** 2, 0) / period);
    return (2 * mult * sd) / mean;
  });
}

export function last(values: number[]): number {
  return values[values.length - 1];
}

// Percentage change over the last n bars
export function roc(values: number[], n: number): number {
  if (values.length <= n) return NaN;
  return values[values.length - 1] / values[values.length - 1 - n] - 1;
}
