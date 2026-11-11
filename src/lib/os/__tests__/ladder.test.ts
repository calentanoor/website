import { describe, expect, it } from "vitest";
import { averagePrice, evaluatePosition, historyStats, tradeStats } from "../ladder";
import { DEFAULT_SETTINGS } from "../defaults";
import type { Position } from "../types";

const now = new Date("2026-11-11").getTime();
const warrant = { id: "w", wkn: "TEST01", issuer: "Test", strike: 100, expiry: "2028-12-15", ratio: 0.1 };
const pos = (bid: number, prices: [number, number][]): Position => ({
  id: "p",
  symbol: "TEST",
  sector: "KI/Halbleiter",
  status: "open",
  warrants: [{ ...warrant, bid, bidAsOf: "2026-11-11" }],
  buys: prices.map(([price, amount], i) => ({ id: `b${i}`, date: `2026-11-0${i + 1}`, warrantId: "w", price, amount })),
});
const ctx = { settings: DEFAULT_SETTINGS, now, sectorInvested: 0, sectorStage3: 0 };

describe("ladder", () => {
  it("averages x@100, x@75, 2x@60 to ≈ 70.6 (target ≈ 84.7)", () => {
    const avg = averagePrice([{ price: 100, amount: 1 }, { price: 75, amount: 1 }, { price: 60, amount: 2 }])!;
    expect(avg).toBeCloseTo(70.588, 2);
    const v = evaluatePosition(pos(65, [[100, 1000], [75, 1000], [60, 2000]]), ctx);
    expect(v.avgPrice).toBeCloseTo(70.588, 2);
    expect(v.levels.find((l) => l.key === "target")!.price).toBeCloseTo(84.71, 1);
    expect(v.units).toBe(4);
  });

  it("at 4x and back at ±0: sell everything and restart with x", () => {
    const v = evaluatePosition(pos(70.6, [[100, 1000], [75, 1000], [60, 2000]]), ctx);
    expect(v.action.kind).toBe("breakeven");
    expect(v.action.tone).toBe("green");
  });

  it("take profit at +20 % on the average", () => {
    expect(evaluatePosition(pos(120, [[100, 1000]]), ctx).action.title).toBe("Ziel erreicht: verkaufen");
  });

  it("stage 2 after −25 %, stage 3 (2x) after a further −20 %", () => {
    expect(evaluatePosition(pos(80, [[100, 1000]]), ctx).action.kind).toBe("hold");
    const s2 = evaluatePosition(pos(75, [[100, 1000]]), ctx);
    expect(s2.action.kind).toBe("add");
    expect(s2.action.addMultiple).toBe(1);
    const s3 = evaluatePosition(pos(60, [[100, 1000], [75, 1000]]), ctx);
    expect(s3.action.addMultiple).toBe(2);
  });

  it("stop after the third purchase at a further −35 %", () => {
    const v = evaluatePosition(pos(39, [[100, 1000], [75, 1000], [60, 2000]]), ctx);
    expect(v.action.kind).toBe("stop");
  });

  it("asks for purchases when none are recorded", () => {
    expect(evaluatePosition({ ...pos(10, []), buys: [] }, ctx).action.kind).toBe("missing");
  });
});

describe("guard rails", () => {
  it("asks to re-evaluate after 4 months without reaching the target", () => {
    const old = pos(90, [[100, 1000]]);
    old.buys[0].date = "2026-06-01";
    const v = evaluatePosition(old, ctx);
    expect(v.action.kind).toBe("review");
    expect(v.action.detail).toMatch(/Monaten offen/);
  });

  it("flags earnings within 10 days", () => {
    const v = evaluatePosition(pos(80, [[100, 1000]]), { ...ctx, earningsDate: now + 5 * 86400000 });
    expect(v.badges.map((b) => b.label).join()).toMatch(/Quartalszahlen/);
  });
});

describe("sales and history", () => {
  it("counts sales into the position result (±0 over all trades)", () => {
    // 2 buys in the old warrant, half of it sold, rest still held
    const p = pos(80, [[100, 1000], [75, 1000]]);
    const pieces = 1000 / 100 + 1000 / 75; // 23.33
    p.sells = [{ id: "s1", date: "2026-11-05", warrantId: "w", price: 90, quantity: pieces / 2 }];
    const v = evaluatePosition(p, ctx);
    const remaining = (pieces / 2) * 80;
    expect(v.value).toBeCloseTo(remaining + (pieces / 2) * 90, 6);
    // target: whole position worth 2400 → price of the held half
    expect(v.levels.find((l) => l.key === "target")!.price).toBeCloseTo((2400 - (pieces / 2) * 90) / (pieces / 2), 4);
  });

  it("computes the return of a closed trade", () => {
    const p = pos(0, [[100, 1000], [75, 1000], [60, 2000]]);
    p.status = "closed";
    const pieces = 10 + 1000 / 75 + 2000 / 60;
    p.sells = [{ id: "s", date: "2026-12-01", warrantId: "w", price: 84.71, quantity: pieces }];
    const t = tradeStats(p);
    expect(t.fullySold).toBe(true);
    expect(t.returnPct).toBeCloseTo(20, 0);
    expect(t.days).toBe(30);
    const h = historyStats([p]);
    expect(h.trades).toBe(1);
    expect(h.winRate).toBe(100);
  });

  it("keeps legacy closes without recorded sales", () => {
    const p = pos(0, [[5, 2000]]);
    p.status = "closed";
    p.closedValue = 2400;
    p.closedDate = "2026-11-11";
    expect(tradeStats(p).returnPct).toBeCloseTo(20);
  });
});
