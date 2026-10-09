// Plain call/put warrant (Optionsschein) suggestions, priced with
// Black-Scholes on a volatility estimate. Prices are per underlying share
// (ratio 1:1) – real warrants add an issuer spread and often a higher IV.
import { bsPrice, delta } from "./options-math";

export type WarrantIdea = {
  type: "Call" | "Put";
  strike: number;
  days: number;
  fairPrice: number; // per share
  leverage: number; // omega: % change of the warrant per 1 % in the underlying
  breakEven: number; // underlying price at expiry needed to recover the premium
  vol: number;
};

const RATE = 0.03;

export function strikeStep(price: number) {
  return price < 25 ? 0.5 : price < 100 ? 1 : price < 250 ? 5 : price < 1000 ? 10 : 50;
}

// At-the-money strike, ~3 months to expiry: enough time for a pattern to play
// out (trades are held up to 20 trading days) without heavy time decay.
// moneyness < 1 = in the money (call strike below / put strike above the
// price): lower leverage, but less time value to lose.
export function warrantIdea(direction: "bullish" | "bearish", price: number, vol: number, days = 90, moneyness = 1): WarrantIdea {
  const type = direction === "bullish" ? "Call" : "Put";
  const step = strikeStep(price);
  const strike = Math.round((type === "Call" ? price * moneyness : price * (2 - moneyness)) / step) * step;
  const t = days / 365;
  const sigma = Math.min(1.5, Math.max(0.1, vol));
  const kind = type === "Call" ? "call" : "put";
  const fairPrice = bsPrice(price, strike, t, sigma, RATE, kind);
  const leverage = Math.abs(delta(price, strike, t, sigma, RATE, kind)) * (price / fairPrice);
  return { type, strike, days, fairPrice, leverage, breakEven: type === "Call" ? strike + fairPrice : strike - fairPrice, vol: sigma };
}

// Value of the same warrant later on (for the backtest of warrant returns)
export function warrantValue(type: "Call" | "Put", spot: number, strike: number, daysLeft: number, vol: number) {
  const t = Math.max(1 / 365, daysLeft / 365);
  return bsPrice(spot, strike, t, vol, RATE, type === "Call" ? "call" : "put");
}
