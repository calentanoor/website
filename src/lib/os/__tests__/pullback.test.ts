import { describe, expect, it } from "vitest";
import { drawdownScore, pullbackMetrics, pullbackScore, qualifiesForPullback, stabilisationScore, upsideScore } from "../pullback";

// 300 days rising from 100 to 200, then a pullback to `end` with a small bounce at the end
function series(end: number, bounce = true) {
  const c = [];
  for (let i = 0; i < 300; i++) c.push(100 + (100 * i) / 299);
  for (let i = 1; i <= 30; i++) c.push(200 - ((200 - end) * i) / 30);
  if (bounce) for (let i = 1; i <= 4; i++) c.push(end * (1 + 0.005 * i));
  return c.map((close, i) => ({ time: i * 86400, open: close, high: close * 1.002, low: close * 0.998, close, volume: 1 }));
}

describe("pullback scoring", () => {
  it("scores the drawdown: best between 15 and 25 %", () => {
    expect(drawdownScore(0.02)).toBe(0);
    expect(drawdownScore(0.1)).toBeCloseTo(50);
    expect(drawdownScore(0.2)).toBe(100);
    expect(drawdownScore(0.325)).toBeCloseTo(50);
    expect(drawdownScore(0.5)).toBe(0);
  });

  it("measures a 20 % pullback in an intact uptrend", () => {
    const m = pullbackMetrics(series(160))!;
    expect(m.drawdown).toBeGreaterThan(0.17);
    expect(m.drawdown).toBeLessThan(0.21);
    expect(m.sma200Rising).toBe(true);
    expect(m.ret5d!).toBeGreaterThan(0);
    expect(stabilisationScore(m)).toBeGreaterThanOrEqual(50);
    expect(qualifiesForPullback(m, 75, 50e9)).toBe(true);
  });

  it("rejects small companies, weak fundamentals and no pullback", () => {
    const m = pullbackMetrics(series(160))!;
    expect(qualifiesForPullback(m, 75, 10e9)).toBe(false);
    expect(qualifiesForPullback(m, 55, 50e9)).toBe(false);
    expect(qualifiesForPullback(pullbackMetrics(series(198, false))!, 75, 50e9)).toBe(false);
  });

  it("ranks the better fundamental and the deeper (not broken) pullback higher", () => {
    const m = pullbackMetrics(series(160))!;
    expect(pullbackScore(m, 85, 20)).toBeGreaterThan(pullbackScore(m, 70, 20));
    expect(upsideScore(30)).toBe(100);
    expect(upsideScore(undefined)).toBe(50);
  });
});
