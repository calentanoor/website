// Data model of the warrant strategy (stored in the browser, exportable as JSON).

export type Warrant = {
  id: string;
  wkn: string;
  issuer: string;
  strike: number; // USD
  expiry: string; // ISO date
  ratio: number; // e.g. 0.1
  bid?: number; // current bid in EUR
  bidAsOf?: string; // ISO date-time of the bid
  iv?: number; // implied volatility from the data sheet, decimal
  ivAsOf?: string;
};

export type Buy = {
  id: string;
  date: string; // ISO date
  warrantId: string;
  price: number; // EUR per warrant
  amount: number; // EUR
};

export type Position = {
  id: string;
  symbol: string;
  name?: string;
  sector: string;
  warrants: Warrant[];
  buys: Buy[];
  status: "open" | "closed";
  closedDate?: string;
  closedValue?: number; // EUR proceeds when closed
  stockPrice?: number; // manual share price (USD), overrides the live price
  stockPriceAsOf?: string;
  earningsDate?: string; // manual next earnings date (ISO)
  note?: string;
};

export type Candidate = {
  id: string;
  symbol: string;
  wkn: string;
  issuer: string;
  strike: number;
  expiry: string;
  ratio: number;
  bid?: number;
  ask?: number;
  omega?: number; // data sheet
  iv?: number; // data sheet, decimal
  premiumPa?: number; // Aufgeld p.a., decimal
  theta?: number; // data sheet, EUR per day
  asOf: string;
};

export type Settings = {
  x: number; // base amount in EUR
  takeProfit: number; // 0.2
  drop1: number; // stage 2 after -25 % below the stage-1 price
  drop2: number; // stage 3 after -20 % below the stage-2 price
  stopAfterLast: { enabled: boolean; drop: number }; // -35 % below the stage-3 price
  timeStop: { enabled: boolean; months: number };
  earnings: { enabled: boolean; days: number };
  minRemaining: { enabled: boolean; months: number };
  maxStage3: { enabled: boolean; count: number };
  highVol: { enabled: boolean; iv: number };
  sectorBudgets: Record<string, number>; // EUR
  finder: {
    omegaMin: number;
    omegaMax: number;
    minMonths: number;
    maxStrikeFactor: number;
    maxSpread: number;
    weights: { time: number; iv: number; vega: number; spread: number };
  };
  rate: number;
  dividendYield: number;
  eurusdManual?: number; // overrides the live rate
};

export type OsStore = {
  version: 1;
  settings: Settings;
  positions: Position[];
  candidates: Candidate[];
};
