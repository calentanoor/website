import { describe, expect, it } from "vitest";
import { callDelta, callPrice, impliedVol, omega, requiredMovePct, timeDecayPct, vegaPct } from "../model";

// Plausibility case from the strategy brief: S=175, K=400, T=2.1 y, σ=42 %, r=4 %.
// The brief quotes C ≈ 7.8, Delta ≈ 0.15, Omega ≈ 3.2, −23 % after 3 months.
// The Black-Scholes formula gives C ≈ 8.05, Delta ≈ 0.18 (d1 ≈ −0.92) and
// therefore Omega ≈ 3.9; the time decay matches.
const m = { S: 175, K: 400, T: 2.1, sigma: 0.42, r: 0.04 };

describe("Black-Scholes model", () => {
  it("prices the call", () => {
    expect(callPrice(m)).toBeCloseTo(8.05, 1);
    expect(callPrice(m)).toBeGreaterThan(7.5);
    expect(callPrice(m)).toBeLessThan(8.5);
  });

  it("computes delta and omega", () => {
    expect(callDelta(m)).toBeCloseTo(0.18, 2);
    expect(omega(m)).toBeCloseTo(3.91, 1);
  });

  it("loses about 23 % in 3 months at an unchanged share price", () => {
    expect(timeDecayPct(m, 0.25)).toBeCloseTo(-22.9, 0);
  });

  it("recovers the implied volatility from the price", () => {
    expect(impliedVol(callPrice(m), { S: 175, K: 400, T: 2.1, r: 0.04 })).toBeCloseTo(0.42, 4);
  });

  it("finds the share move for +20 % (smaller than 20 % because of the leverage)", () => {
    const now = requiredMovePct(m, 1.2, 0)!;
    expect(now).toBeGreaterThan(0);
    expect(now).toBeLessThan(20 / 3);
    expect(requiredMovePct(m, 1.2, 0.25)!).toBeGreaterThan(now); // time decay must be made up
  });

  it("reports vega in % per volatility point", () => {
    expect(vegaPct(m)).toBeGreaterThan(1);
  });

  it("matches put-call independent limits", () => {
    expect(callPrice({ ...m, T: 0 })).toBe(0);
    expect(callPrice({ ...m, S: 1000, T: 0 })).toBe(600);
  });
});
