import type { OsStore, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  x: 1000,
  takeProfit: 0.2,
  drop1: 0.25,
  drop2: 0.2,
  stopAfterLast: { enabled: true, drop: 0.35 },
  timeStop: { enabled: true, months: 4 },
  earnings: { enabled: true, days: 10 },
  minRemaining: { enabled: true, months: 9 },
  maxStage3: { enabled: true, count: 2 },
  highVol: { enabled: true, iv: 0.6 },
  sectorBudgets: { "KI/Halbleiter": 16000 },
  finder: {
    omegaMin: 2.5,
    omegaMax: 3,
    minMonths: 14,
    maxStrikeFactor: 1.5,
    maxSpread: 0.02,
    weights: { time: 1, iv: 1, vega: 1, spread: 1 },
  },
  rate: 0.04,
  dividendYield: 0,
};

// The user's positions as of 11.11.2026 – purchase prices and amounts are
// filled in by the user.
export function startData(): OsStore {
  const sector = "KI/Halbleiter";
  const w = (id: string, wkn: string, issuer: string, strike: number, expiry: string) => ({ id, wkn, issuer, strike, expiry, ratio: 0.1 });
  return {
    version: 1,
    settings: DEFAULT_SETTINGS,
    candidates: [],
    positions: [
      { id: "p-nvda", symbol: "NVDA", name: "Nvidia", sector, status: "open", warrants: [w("w-bd00nl", "BD00NL", "Vontobel", 400, "2028-12-15")], buys: [], note: "Am 11.11.2026 nachgekauft – Teilkäufe nachtragen." },
      { id: "p-cls", symbol: "CLS", name: "Celestica", sector, status: "open", warrants: [w("w-fg8hjt", "FG8HJT", "Société Générale", 460, "2028-01-21")], buys: [] },
      { id: "p-avgo", symbol: "AVGO", name: "Broadcom", sector, status: "open", warrants: [w("w-avgo-600", "", "", 600, "2029-01-19")], buys: [], note: "Einstieg 11.11.2026 – WKN, Emittent und genaue Fälligkeit nachtragen." },
      { id: "p-ter", symbol: "TER", name: "Teradyne", sector, status: "open", warrants: [w("w-bd1u2u", "BD1U2U", "Vontobel", 600, "2028-01-21")], buys: [] },
      { id: "p-avgo-old", symbol: "AVGO", name: "Broadcom", sector, status: "closed", closedDate: "2026-11-11", warrants: [w("w-mn85km", "MN85KM", "Morgan Stanley", 410, "2028-01-21")], buys: [] },
    ],
  };
}
