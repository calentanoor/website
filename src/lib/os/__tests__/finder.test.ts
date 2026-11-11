import { describe, expect, it } from "vitest";
import { evaluateCandidate, parseCandidates, parseDate, parseNumber, rankCandidates } from "../finder";
import { DEFAULT_SETTINGS } from "../defaults";

describe("parsing", () => {
  it("reads German numbers, percentages and ratios", () => {
    expect(parseNumber("1.234,56")).toBeCloseTo(1234.56);
    expect(parseNumber("0,1")).toBeCloseTo(0.1);
    expect(parseNumber("42 %")).toBeCloseTo(0.42);
    expect(parseNumber("10:1")).toBeCloseTo(0.1);
    expect(parseNumber("400 USD")).toBe(400);
  });

  it("reads dates", () => {
    expect(parseDate("15.12.2028")).toBe("2028-12-15");
    expect(parseDate("2028-01-21")).toBe("2028-01-21");
    expect(parseDate("01/2029")).toBe("2029-01-19");
  });

  it("parses a pasted table with header", () => {
    const text = "WKN\tEmittent\tBasispreis\tFälligkeit\tBezugsverhältnis\tGeld\tBrief\tOmega\tImpl. Vola\nAB1234\tVontobel\t200,00\t15.12.2028\t0,1\t4,10\t4,15\t2,8\t45 %";
    const { candidates, errors } = parseCandidates(text);
    expect(errors).toEqual([]);
    expect(candidates[0]).toMatchObject({ wkn: "AB1234", strike: 200, expiry: "2028-12-15", ratio: 0.1, bid: 4.1, ask: 4.15, omega: 2.8 });
    expect(candidates[0].iv).toBeCloseTo(0.45);
  });
});

describe("filter and ranking", () => {
  const now = new Date("2026-11-11").getTime();
  const market = { stockPrice: 175, eurusd: 1.1, now };
  const base = { id: "", symbol: "X", issuer: "T", ratio: 0.1, asOf: "2026-11-11" };
  it("drops candidates that break the rules and ranks the rest", () => {
    const views = [
      { ...base, id: "a", wkn: "OK1", strike: 200, expiry: "2028-12-15", bid: 4.0, ask: 4.05, omega: 2.8, iv: 0.45 },
      { ...base, id: "b", wkn: "OK2", strike: 210, expiry: "2028-06-16", bid: 3.0, ask: 3.03, omega: 2.9, iv: 0.47 },
      { ...base, id: "c", wkn: "FAR", strike: 400, expiry: "2028-12-15", bid: 0.5, ask: 0.52, omega: 3.0, iv: 0.42 },
      { ...base, id: "d", wkn: "SHORT", strike: 200, expiry: "2027-06-18", bid: 2, ask: 2.02, omega: 2.7, iv: 0.45 },
    ].map((c) => evaluateCandidate(c, market, DEFAULT_SETTINGS));
    const ranked = rankCandidates(views, DEFAULT_SETTINGS);
    expect(views.find((v) => v.candidate.wkn === "FAR")!.violations.join()).toMatch(/Basis/);
    expect(views.find((v) => v.candidate.wkn === "SHORT")!.violations.join()).toMatch(/Restlaufzeit/);
    expect(ranked[0].best).toBe(true);
    expect(["OK1", "OK2"]).toContain(ranked[0].candidate.wkn);
  });
});
