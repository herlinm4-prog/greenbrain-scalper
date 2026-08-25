import { describe, expect, it } from "vitest";
import { RiskEngine } from "../src/risk-engine.js";

const market = { symbol: "EURUSD", bid: 1.1, ask: 1.1001, timestampMs: 1, broker: "demo" };
const proposal = { id: "p", symbol: "EURUSD", side: "buy" as const, entry: 1.1001, stopLoss: 1.0991, takeProfit: 1.1021, confidence: 0.9, rationale: ["test"] };

describe("RiskEngine dollar controls", () => {
  it("uses the stricter of percentage and dollar risk", () => {
    const decision = new RiskEngine().evaluate("demo", {
      enabled: true,
      maxRiskFraction: 0.01,
      maxDailyLossFraction: 0.03,
      maxOpenPositions: 1,
      maxSpreadBps: 20,
      maxRiskAmount: 25,
    }, { equity: 10_000, dailyPnl: 0, openPositions: 0 }, market, proposal);
    expect(decision.approved).toBe(true);
    expect(decision.riskAmount).toBe(25);
  });

  it("enforces an absolute daily loss cap when it is stricter", () => {
    const decision = new RiskEngine().evaluate("demo", {
      enabled: true,
      maxRiskFraction: 0.01,
      maxDailyLossFraction: 0.03,
      maxOpenPositions: 1,
      maxSpreadBps: 20,
      maxDailyLossAmount: 50,
    }, { equity: 10_000, dailyPnl: -50, openPositions: 0 }, market, proposal);
    expect(decision.approved).toBe(false);
    expect(decision.reason).toMatch(/daily loss/i);
  });
});
