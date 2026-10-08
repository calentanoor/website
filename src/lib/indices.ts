// Index definitions and constituent lists (Yahoo Finance tickers).
// Yahoo offers no API for index members, so the lists are maintained here by
// hand. Index compositions change a few times per year – update when needed.

export type IndexDef = {
  id: string;
  name: string;
  symbol: string;
  region: string;
  constituents?: string[];
};

const DAX = [
  "ADS.DE", "AIR.DE", "ALV.DE", "BAS.DE", "BAYN.DE", "BEI.DE", "BMW.DE",
  "BNR.DE", "CBK.DE", "CON.DE", "DB1.DE", "DBK.DE", "DHL.DE", "DTE.DE",
  "DTG.DE", "ENR.DE", "EOAN.DE", "FME.DE", "FRE.DE", "G1A.DE", "G24.DE",
  "HEI.DE", "HEN3.DE", "HNR1.DE", "IFX.DE", "MBG.DE", "MRK.DE", "MTX.DE",
  "MUV2.DE", "PAH3.DE", "QIA.DE", "RHM.DE", "RWE.DE", "SAP.DE",
  "SHL.DE", "SIE.DE", "SRT3.DE", "SY1.DE", "VNA.DE", "VOW3.DE", "ZAL.DE",
];

const EURO_STOXX_50 = [
  "ABI.BR", "AD.AS", "ADS.DE", "ADYEN.AS", "AI.PA", "AIR.PA", "ALV.DE",
  "ARGX.BR", "ASML.AS", "BAS.DE", "BAYN.DE", "BBVA.MC", "BMW.DE", "BN.PA",
  "BNP.PA", "CS.PA", "DB1.DE", "DBK.DE", "DG.PA", "DHL.DE", "DTE.DE",
  "EL.PA", "ENEL.MI", "ENI.MI", "IBE.MC", "IFX.DE", "INGA.AS", "ISP.MI",
  "ITX.MC", "MBG.DE", "MC.PA", "MUV2.DE", "NDA-FI.HE", "OR.PA", "PRX.AS",
  "RACE.MI", "RHM.DE", "RMS.PA", "SAF.PA", "SAN.MC", "SAN.PA", "SAP.DE",
  "SGO.PA", "SIE.DE", "SU.PA", "TTE.PA", "UCG.MI", "VOW3.DE", "WKL.AS",
  "ENR.DE",
];

const DOW_JONES = [
  "AAPL", "AMGN", "AMZN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS",
  "GS", "HD", "HON", "IBM", "JNJ", "JPM", "KO", "MCD", "MMM", "MRK", "MSFT",
  "NKE", "NVDA", "PG", "SHW", "TRV", "UNH", "V", "VZ", "WMT",
];

const NASDAQ_100 = [
  "AAPL", "ABNB", "ADBE", "ADI", "ADP", "ADSK", "AEP", "AMAT", "AMD", "AMGN",
  "AMZN", "APP", "ARM", "ASML", "AVGO", "AXON", "AZN", "BIIB", "BKNG", "BKR",
  "CCEP", "CDNS", "CDW", "CEG", "CHTR", "CMCSA", "COST", "CPRT", "CRWD",
  "CSCO", "CSGP", "CSX", "CTAS", "CTSH", "DASH", "DDOG", "DXCM", "EA", "EXC",
  "FANG", "FAST", "FTNT", "GEHC", "GFS", "GILD", "GOOG", "GOOGL", "HON",
  "IDXX", "INTC", "INTU", "ISRG", "KDP", "KHC", "KLAC", "LIN", "LRCX", "LULU",
  "MAR", "MCHP", "MDB", "MDLZ", "MELI", "META", "MNST", "MRVL", "MSFT",
  "MSTR", "MU", "NFLX", "NVDA", "NXPI", "ODFL", "ON", "ORLY", "PANW", "PAYX",
  "PCAR", "PDD", "PEP", "PLTR", "PYPL", "QCOM", "REGN", "ROP", "ROST", "SBUX",
  "SHOP", "SNPS", "TEAM", "TMUS", "TRI", "TSLA", "TTD", "TTWO", "TXN", "VRSK",
  "VRTX", "WBD", "WDAY", "XEL", "ZS",
];

export const INDICES: IndexDef[] = [
  { id: "dax", name: "DAX", symbol: "^GDAXI", region: "Deutschland", constituents: DAX },
  { id: "eurostoxx50", name: "Euro Stoxx 50", symbol: "^STOXX50E", region: "Eurozone", constituents: EURO_STOXX_50 },
  { id: "sp500", name: "S&P 500", symbol: "^GSPC", region: "USA" },
  { id: "nasdaq100", name: "Nasdaq 100", symbol: "^NDX", region: "USA", constituents: NASDAQ_100 },
  { id: "dowjones", name: "Dow Jones", symbol: "^DJI", region: "USA", constituents: DOW_JONES },
  { id: "mdax", name: "MDAX", symbol: "^MDAXI", region: "Deutschland" },
  { id: "nikkei", name: "Nikkei 225", symbol: "^N225", region: "Japan" },
  { id: "vix", name: "VIX", symbol: "^VIX", region: "Volatilität" },
];

export function getIndex(id: string): IndexDef | undefined {
  return INDICES.find((i) => i.id === id);
}
