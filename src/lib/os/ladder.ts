// Position evaluation for the warrant ladder (pure functions).
//
// A position is one share; it can hold several warrants on that share. Profit
// and the "±0" rule always refer to all purchases together. Price levels are
// expressed in the price of the warrant bought last (the reference warrant):
// with several warrants they assume all warrants move by the same percentage.
import type { Buy, Position, Settings, Warrant } from "./types";

export type Tone = "green" | "yellow" | "red" | "orange" | "white" | "grey";

export type Action = {
  tone: Tone;
  title: string;
  detail?: string;
  kind: "target" | "breakeven" | "add" | "stop" | "review" | "hold" | "missing";
  addMultiple?: number; // for kind "add": how many x to buy
};

export type Badge = { label: string; tone: "info" | "warn" | "danger" };

export type Level = { key: "avg" | "target" | "breakeven" | "add" | "stop" | "current"; label: string; price: number; distancePct?: number };

export type PositionView = {
  position: Position;
  invested: number; // EUR
  units: number; // invested / x
  stage: number; // number of purchases
  value?: number; // EUR at current bids
  plPct?: number;
  avgPrice?: number; // per piece, only with a single warrant
  refWarrant?: Warrant;
  refBid?: number;
  levels: Level[];
  holdingDays?: number;
  remainingMonths?: number; // shortest remaining time of the warrants held
  action: Action;
  badges: Badge[];
  nextAddAmount?: number; // EUR
};

export type Context = {
  settings: Settings;
  now: number; // ms
  stockPrice?: number; // USD
  earningsDate?: number; // ms
  sectorInvested: number; // EUR invested in the position's sector (all open positions)
  sectorStage3: number; // open positions at the last stage in this sector
  impliedVol?: (w: Warrant) => number | undefined;
};

const DAY = 86400000;
const MONTH = 30.44 * DAY;
const ts = (iso: string) => new Date(iso).getTime();
// tolerance for floating-point comparisons of prices and values
const EPS = 1e-9;

export function sortedBuys(p: Position): Buy[] {
  return [...p.buys].sort((a, b) => ts(a.date) - ts(b.date));
}

// Shares (warrants) bought per warrant id
export function sharesByWarrant(p: Position): Map<string, number> {
  const m = new Map<string, number>();
  for (const b of p.buys) if (b.price > 0) m.set(b.warrantId, (m.get(b.warrantId) ?? 0) + b.amount / b.price);
  return m;
}

// Stück-weighted average price of all purchases of one warrant
export function averagePrice(buys: Pick<Buy, "price" | "amount">[]): number | undefined {
  const invested = buys.reduce((a, b) => a + b.amount, 0);
  const shares = buys.reduce((a, b) => a + (b.price > 0 ? b.amount / b.price : 0), 0);
  return shares > 0 ? invested / shares : undefined;
}

export function evaluatePosition(p: Position, ctx: Context): PositionView {
  const s = ctx.settings;
  const buys = sortedBuys(p);
  const invested = buys.reduce((a, b) => a + b.amount, 0);
  const stage = buys.length;
  const units = s.x > 0 ? invested / s.x : 0;
  const shares = sharesByWarrant(p);
  const held = p.warrants.filter((w) => (shares.get(w.id) ?? 0) > 0);
  const last = buys[buys.length - 1];
  const refWarrant = last ? p.warrants.find((w) => w.id === last.warrantId) : p.warrants[p.warrants.length - 1];
  const refBid = refWarrant?.bid;
  const badges: Badge[] = [];

  const value = held.length && held.every((w) => w.bid != null) ? held.reduce((a, w) => a + (shares.get(w.id) ?? 0) * w.bid!, 0) : undefined;
  const plPct = value != null && invested > 0 ? (value / invested - 1) * 100 : undefined;
  const avgPrice = held.length === 1 ? averagePrice(buys) : undefined;

  // price of the reference warrant at which the whole position is worth `target` EUR
  const levelFor = (target: number) => (value && refBid ? (refBid * target) / value : undefined);
  const dist = (price?: number) => (price != null && refBid ? (price / refBid - 1) * 100 : undefined);

  const levels: Level[] = [];
  const push = (key: Level["key"], label: string, price?: number) => {
    if (price != null && Number.isFinite(price)) levels.push({ key, label, price, distancePct: key === "current" ? undefined : dist(price) });
  };
  const targetPrice = levelFor(invested * (1 + s.takeProfit));
  const breakevenPrice = levelFor(invested);
  const addPrice = last && stage < 3 ? last.price * (1 - (stage === 1 ? s.drop1 : s.drop2)) : undefined;
  const third = stage >= 3 ? buys[2] : undefined;
  const stopPrice = third && s.stopAfterLast.enabled ? third.price * (1 - s.stopAfterLast.drop) : undefined;
  // add and stop levels refer to the warrant of that purchase; only comparable if it is the reference warrant
  const addComparable = last && refWarrant && last.warrantId === refWarrant.id;
  push("avg", "Ø Einstand", avgPrice);
  push("breakeven", "±0", held.length > 1 ? breakevenPrice : undefined);
  push("target", `Ziel +${Math.round(s.takeProfit * 100)} %`, targetPrice);
  if (addComparable) push("add", stage === 1 ? "Nachkauf x" : "Nachkauf 2x", addPrice);
  if (third && third.warrantId === refWarrant?.id) push("stop", "Verlust-Stopp", stopPrice);
  push("current", "Aktuell", refBid);

  const holdingDays = buys[0] ? Math.floor((ctx.now - ts(buys[0].date)) / DAY) : undefined;
  const remainingMonths = (held.length ? held : refWarrant ? [refWarrant] : []).reduce<number | undefined>((m, w) => {
    const r = (ts(w.expiry) - ctx.now) / MONTH;
    return m == null || r < m ? r : m;
  }, undefined);
  const nextAddAmount = stage === 1 ? s.x : stage === 2 ? 2 * s.x : undefined;

  // --- badges
  const earningsSoon = s.earnings.enabled && ctx.earningsDate != null && ctx.earningsDate >= ctx.now - DAY && ctx.earningsDate - ctx.now <= s.earnings.days * DAY;
  if (earningsSoon) badges.push({ label: `Quartalszahlen in ${Math.max(0, Math.ceil((ctx.earningsDate! - ctx.now) / DAY))} Tagen – kein Nachkauf davor`, tone: "warn" });
  const budget = s.sectorBudgets[p.sector];
  if (p.status === "open" && budget != null) {
    if (ctx.sectorInvested > budget) badges.push({ label: `Sektor-Budget ${p.sector} überschritten`, tone: "danger" });
    else if (nextAddAmount && ctx.sectorInvested + nextAddAmount > budget) badges.push({ label: `Nächster Nachkauf sprengt Sektor-Budget`, tone: "warn" });
  }
  if (s.maxStage3.enabled && stage >= 3 && ctx.sectorStage3 > s.maxStage3.count) badges.push({ label: `${ctx.sectorStage3} Positionen in Stufe 4x (max. ${s.maxStage3.count})`, tone: "danger" });
  const iv = refWarrant ? refWarrant.iv ?? ctx.impliedVol?.(refWarrant) : undefined;
  if (s.highVol.enabled && iv != null && iv >= s.highVol.iv) badges.push({ label: `Vola hoch (${Math.round(iv * 100)} %)`, tone: "warn" });
  if (refWarrant && ctx.stockPrice && refWarrant.strike > s.finder.maxStrikeFactor * ctx.stockPrice) badges.push({ label: "außerhalb der Finder-Regeln", tone: "info" });
  if (refWarrant?.bidAsOf && ctx.now - ts(refWarrant.bidAsOf) > 3 * DAY) badges.push({ label: "Geldkurs älter als 3 Tage", tone: "warn" });

  // --- next step (exactly one)
  const action = ((): Action => {
    if (p.status === "closed") return { tone: "grey", kind: "hold", title: "Geschlossen" };
    if (!stage) return { tone: "grey", kind: "missing", title: "Teilkäufe nachtragen", detail: "Ohne Kaufpreis und Betrag lässt sich die Leiter nicht berechnen." };
    if (value == null || refBid == null) return { tone: "grey", kind: "missing", title: "Aktuellen Geldkurs eintragen", detail: "Für jeden gehaltenen Schein wird ein aktueller Geldkurs (Bid) benötigt." };
    if (plPct! >= s.takeProfit * 100 - EPS) return { tone: "green", kind: "target", title: "Ziel erreicht: verkaufen", detail: `Position steht bei ${fmtPct(plPct)}.` };
    if (stage >= 3 && value >= invested * (1 - EPS)) return { tone: "green", kind: "breakeven", title: "Bei ±0: alles verkaufen, mit x neu einsteigen", detail: "Danach mit dem aktuell besten Schein neu beginnen." };
    if (third && stopPrice != null) {
      const thirdWarrant = p.warrants.find((w) => w.id === third.warrantId);
      if (thirdWarrant?.bid != null && thirdWarrant.bid <= stopPrice + EPS) return { tone: "red", kind: "stop", title: "Stopp erreicht: Ausstieg prüfen", detail: `Schein ${fmtPct((thirdWarrant.bid / third.price - 1) * 100)} unter dem dritten Kauf.` };
    }
    if (last && addPrice != null) {
      const lastWarrant = p.warrants.find((w) => w.id === last.warrantId);
      if (lastWarrant?.bid != null && lastWarrant.bid <= addPrice + EPS) {
        const m = stage === 1 ? 1 : 2;
        return { tone: "yellow", kind: "add", addMultiple: m, title: `Nachkauf fällig: ${m === 1 ? "x" : "2x"} kaufen`, detail: `${fmtEur(m * s.x)} – in denselben oder den aktuell besten Schein.` };
      }
    }
    const reasons: string[] = [];
    if (s.timeStop.enabled && holdingDays != null && holdingDays > s.timeStop.months * 30.44) reasons.push(`seit ${Math.round(holdingDays / 30.44)} Monaten offen ohne +${Math.round(s.takeProfit * 100)} %`);
    if (s.minRemaining.enabled && remainingMonths != null && remainingMonths < s.minRemaining.months) reasons.push(`Restlaufzeit nur ${remainingMonths.toFixed(1).replace(".", ",")} Monate`);
    if (reasons.length) return { tone: "orange", kind: "review", title: "Neu bewerten", detail: reasons.join(" · ") };
    const triggers = [
      targetPrice != null ? `${fmtEur(targetPrice)} (Ziel)` : undefined,
      addComparable && addPrice != null ? `${fmtEur(addPrice)} (Nachkauf ${stage === 1 ? "x" : "2x"})` : undefined,
      stage >= 3 && breakevenPrice != null ? `${fmtEur(breakevenPrice)} (±0)` : undefined,
      stage >= 3 && stopPrice != null && third?.warrantId === refWarrant?.id ? `${fmtEur(stopPrice)} (Stopp)` : undefined,
    ].filter(Boolean);
    return { tone: "white", kind: "hold", title: "Halten", detail: triggers.length ? `Nächster Trigger bei ${triggers.join(" bzw. ")}` : undefined };
  })();

  return { position: p, invested, units, stage, value, plPct, avgPrice, refWarrant, refBid, levels, holdingDays, remainingMonths, action, badges, nextAddAmount };
}

export const ACTION_ORDER: Record<Tone, number> = { red: 0, yellow: 1, green: 2, orange: 3, grey: 4, white: 5 };

// ---------------------------------------------------------------------------

export function fmtEur(v?: number) {
  if (v == null || !Number.isFinite(v)) return "–";
  return `${v.toLocaleString("de-DE", { minimumFractionDigits: v < 100 ? 2 : 0, maximumFractionDigits: v < 100 ? 2 : 0 })} €`;
}

export function fmtPct(v?: number, digits = 1) {
  if (v == null || !Number.isFinite(v)) return "–";
  return `${v > 0 ? "+" : ""}${v.toLocaleString("de-DE", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;
}
