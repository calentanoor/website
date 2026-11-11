// Warrant finder: parse candidates pasted from a broker's data sheet, filter
// them by the strategy rules and rank the rest (pure functions).
import { callFromWarrantEur, callPrice, impliedVol, omega as modelOmega, requiredMovePct, timeDecayPct, vegaPct, volShiftPct, yearsBetween, type ModelInput } from "./model";
import type { Candidate, Settings } from "./types";

// ---------------------------------------------------------------------------
// Parsing

// German or English number: "1.234,56", "0,1", "42 %", "1:10", "2.75"
export function parseNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  let s = raw.trim().replace(/\s|€|EUR|USD|\$/gi, "");
  if (!s || s === "-" || s === "–") return undefined;
  const ratio = /^(\d+(?:[.,]\d+)?):(\d+(?:[.,]\d+)?)$/.exec(s);
  if (ratio) {
    const a = Number(ratio[1].replace(",", "."));
    const b = Number(ratio[2].replace(",", "."));
    return a && b ? Math.min(a, b) / Math.max(a, b) : undefined;
  }
  const percent = s.endsWith("%");
  s = s.replace("%", "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return undefined;
  return percent ? n / 100 : n;
}

// "15.12.2028", "2028-12-15", "12/2028", "01/2029" → ISO date
export function parseDate(raw: string | undefined): string | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/.exec(s);
  if (m) return iso(Number(m[3].length === 2 ? `20${m[3]}` : m[3]), Number(m[2]), Number(m[1]));
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[/.](\d{4})$/.exec(s);
  if (m) return thirdFriday(Number(m[2]), Number(m[1]));
  return undefined;
}

const iso = (y: number, mo: number, d: number) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// Month-only maturities are usually the third Friday of that month.
function thirdFriday(y: number, mo: number) {
  const first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay();
  return iso(y, mo, 1 + ((5 - first + 7) % 7) + 14);
}

const HEADERS: [keyof Candidate | "skip", RegExp][] = [
  ["wkn", /^(wkn|isin|kennung)/i],
  ["issuer", /^(emittent|issuer|anbieter)/i],
  ["strike", /^(basis(preis)?|strike|ausübungspreis)/i],
  ["expiry", /^(fälligkeit|faelligkeit|laufzeit|verfall|bewertungstag|letzter handelstag|expiry|maturity)/i],
  ["ratio", /^(bezugsverh|bv|ratio|bezug)/i],
  ["bid", /^(geld|bid)/i],
  ["ask", /^(brief|ask)/i],
  ["omega", /^(omega|eff.*hebel|hebel)/i],
  ["iv", /^(impl|iv|vola)/i],
  ["premiumPa", /^(aufgeld p\.? ?a|aufgeld.*jahr|premium p\.?a)/i],
  ["theta", /^theta/i],
];

const DEFAULT_ORDER: (keyof Candidate)[] = ["wkn", "issuer", "strike", "expiry", "ratio", "bid", "ask", "omega", "iv", "premiumPa", "theta"];

export type ParseResult = { candidates: Omit<Candidate, "id" | "symbol" | "asOf">[]; errors: string[] };

// Table pasted as TSV (from a spreadsheet or broker page), CSV or semicolon
// separated, with or without a header row.
export function parseCandidates(text: string): ParseResult {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return { candidates: [], errors: [] };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(";") ? ";" : ",";
  const split = (l: string) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
  const first = split(lines[0]);
  const mapped = first.map((h) => HEADERS.find(([, re]) => re.test(h))?.[0]);
  const hasHeader = mapped.filter(Boolean).length >= 3;
  const columns = hasHeader ? mapped : DEFAULT_ORDER;
  const rows = hasHeader ? lines.slice(1) : lines;

  const candidates: ParseResult["candidates"] = [];
  const errors: string[] = [];
  rows.forEach((line, i) => {
    const cells = split(line);
    const get = (key: keyof Candidate) => {
      const idx = columns.indexOf(key as never);
      return idx >= 0 ? cells[idx] : undefined;
    };
    const ivRaw = parseNumber(get("iv"));
    const premiumRaw = parseNumber(get("premiumPa"));
    const c = {
      wkn: (get("wkn") ?? "").toUpperCase(),
      issuer: get("issuer") ?? "",
      strike: parseNumber(get("strike")) ?? NaN,
      expiry: parseDate(get("expiry")) ?? "",
      ratio: parseNumber(get("ratio")) ?? 0.1,
      bid: parseNumber(get("bid")),
      ask: parseNumber(get("ask")),
      omega: parseNumber(get("omega")),
      // "42" and "42 %" both mean 42 %
      iv: ivRaw == null ? undefined : ivRaw > 1.5 ? ivRaw / 100 : ivRaw,
      premiumPa: premiumRaw == null ? undefined : premiumRaw > 1.5 ? premiumRaw / 100 : premiumRaw,
      theta: parseNumber(get("theta")),
    };
    if (!c.wkn || !Number.isFinite(c.strike) || !c.expiry) errors.push(`Zeile ${i + 1 + (hasHeader ? 1 : 0)}: WKN, Basispreis oder Fälligkeit fehlt`);
    else candidates.push(c);
  });
  return { candidates, errors };
}

// ---------------------------------------------------------------------------
// Evaluation

export type Market = { stockPrice?: number; eurusd?: number; now: number; earningsDate?: number };

export type CandidateView = {
  candidate: Candidate;
  T: number;
  months: number;
  spread?: number; // relative to the ask
  iv?: number; // data sheet or implied from the mid price
  ivSource?: "Datenblatt" | "Modell";
  omega?: number;
  omegaSource?: "Datenblatt" | "Modell";
  timeLoss3m?: number; // % after 3 months at an unchanged share price
  timeLossSource?: "Modell" | "Aufgeld p.a.";
  vegaPct?: number;
  volMinus3?: number; // % at -3 volatility points
  move: { now?: number; m1?: number; m3?: number }; // share move for +20 %
  violations: string[];
  score?: number; // lower = better (only for candidates passing all filters)
  best?: boolean;
  earningsSoon: boolean;
};

export function evaluateCandidate(c: Candidate, m: Market, s: Settings): CandidateView {
  const T = yearsBetween(m.now, new Date(c.expiry).getTime());
  const months = T * 12;
  const mid = c.bid != null && c.ask != null ? (c.bid + c.ask) / 2 : c.ask ?? c.bid;
  const spread = c.bid != null && c.ask != null && c.ask > 0 ? (c.ask - c.bid) / c.ask : undefined;
  const base: Omit<ModelInput, "sigma"> | undefined = m.stockPrice && T > 0 ? { S: m.stockPrice, K: c.strike, T, r: s.rate, q: s.dividendYield } : undefined;

  let iv = c.iv;
  let ivSource: CandidateView["ivSource"] = c.iv != null ? "Datenblatt" : undefined;
  if (iv == null && base && mid && m.eurusd) {
    iv = impliedVol(callFromWarrantEur(mid, c.ratio, m.eurusd), base);
    ivSource = iv != null ? "Modell" : undefined;
  }
  const model = base && iv ? { ...base, sigma: iv } : undefined;
  const omega = c.omega ?? (model ? modelOmega(model) : undefined);
  const timeLoss3m = model ? timeDecayPct(model, 0.25) : c.premiumPa != null ? -c.premiumPa * 25 : undefined;

  const violations: string[] = [];
  const f = s.finder;
  if (omega == null) violations.push("Omega unbekannt");
  else if (omega < f.omegaMin || omega > f.omegaMax) violations.push(`Omega ${fmt(omega)} außerhalb ${fmt(f.omegaMin)}–${fmt(f.omegaMax)}`);
  if (months < f.minMonths) violations.push(`Restlaufzeit ${fmt(months, 1)} Mon. < ${f.minMonths}`);
  if (m.stockPrice && c.strike > f.maxStrikeFactor * m.stockPrice) violations.push(`Basis > ${fmt(f.maxStrikeFactor)} × Kurs`);
  if (spread == null) violations.push("Geld/Brief fehlt");
  else if (spread > f.maxSpread) violations.push(`Spread ${fmt(spread * 100, 1)} % > ${fmt(f.maxSpread * 100, 1)} %`);

  return {
    candidate: c,
    T,
    months,
    spread,
    iv,
    ivSource,
    omega,
    omegaSource: c.omega != null ? "Datenblatt" : omega != null ? "Modell" : undefined,
    timeLoss3m,
    timeLossSource: model ? "Modell" : c.premiumPa != null ? "Aufgeld p.a." : undefined,
    vegaPct: model ? vegaPct(model) : undefined,
    volMinus3: model ? volShiftPct(model, -3) : undefined,
    move: model
      ? { now: requiredMovePct(model, 1.2, 0), m1: requiredMovePct(model, 1.2, 1 / 12), m3: requiredMovePct(model, 1.2, 0.25) }
      : {},
    violations,
    earningsSoon: s.earnings.enabled && m.earningsDate != null && m.earningsDate >= m.now && m.earningsDate - m.now <= s.earnings.days * 86400000,
  };
}

// Score = weighted sum of min–max-normalised criteria within one share's
// passing candidates (0 = best on every criterion). Lower is better.
export function rankCandidates(views: CandidateView[], s: Settings): CandidateView[] {
  const ok = views.filter((v) => !v.violations.length);
  const w = s.finder.weights;
  const criteria: [number, (v: CandidateView) => number | undefined][] = [
    [w.time, (v) => (v.timeLoss3m == null ? undefined : -v.timeLoss3m)], // larger loss = worse
    [w.iv, (v) => v.iv],
    [w.vega, (v) => v.vegaPct],
    [w.spread, (v) => v.spread],
  ];
  const norm = criteria.map(([weight, get]) => {
    const vals = ok.map(get).filter((x): x is number => x != null);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    return (v: CandidateView) => {
      const x = get(v);
      if (x == null || !vals.length) return weight * 0.5; // unknown → neutral
      return weight * (hi > lo ? (x - lo) / (hi - lo) : 0);
    };
  });
  const weightSum = criteria.reduce((a, [weight]) => a + weight, 0) || 1;
  const scored = views.map((v) => (v.violations.length ? v : { ...v, score: norm.reduce((a, fn) => a + fn(v), 0) / weightSum }));
  const best = scored.filter((v) => v.score != null).sort((a, b) => a.score! - b.score!)[0];
  return scored
    .map((v) => ({ ...v, best: v === best }))
    .sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity) || a.violations.length - b.violations.length);
}

// Model value of a candidate in EUR (for display)
export function modelPriceEur(v: CandidateView, m: Market, s: Settings) {
  if (!m.stockPrice || !m.eurusd || !v.iv) return undefined;
  return (callPrice({ S: m.stockPrice, K: v.candidate.strike, T: v.T, sigma: v.iv, r: s.rate, q: s.dividendYield }) * v.candidate.ratio) / m.eurusd;
}

const fmt = (v: number, digits = 2) => v.toLocaleString("de-DE", { maximumFractionDigits: digits });
