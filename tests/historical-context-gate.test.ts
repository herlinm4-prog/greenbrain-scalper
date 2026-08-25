import { describe, expect, it } from "vitest";
import { TradingEngine } from "../src/trading-engine.js";
import type { HistoricalContext } from "../src/market-intelligence.js";

const engine = new TradingEngine({ minimumConfidence: 0.6, minimumSurvivalFraction: 0, shadowScenarios: [] });
const policy = { enabled: true, maxRiskFraction: 0.01, maxDailyLossFraction: 0.03, maxOpenPositions: 2, maxSpreadBps: 20 };
const account = { equity: 10_000, dailyPnl: 0, openPositions: 0 };
const market = { symbol: "EURUSD", bid: 1.1, ask: 1.1001, timestampMs: 1, broker: "demo" };
const proposal = { id: "p", symbol: "EURUSD", side: "sell" as const, entry: 1.1, stopLoss: 1.101, takeProfit: 1.098, confidence: 0.8, rationale: ["test"] };
const baseContext: HistoricalContext = { currentPrice: 1.1, periodHigh: 1.12, periodLow: 1.08, rangePosition: 0.5, distanceFromHighFraction: .01, distanceFromLowFraction: .01, trend: "up", trendStrength: .7, volatilityFraction: .002, support: 1.09, resistance: 1.11, posture: "favor-long", confidence: .8, reasons: [], cautions: [] };

describe("TradingEngine historical intelligence gate", () => {
  it("rejects a signal that conflicts with historical posture", () => {
    const decision = engine.evaluate("demo", policy, account, market, proposal, baseContext);
    expect(decision.status).toBe("rejected");
    expect(decision.reason).toMatch(/conflicts/i);
  });

  it("rejects exposure when intelligence says avoid", () => {
    const decision = engine.evaluate("demo", policy, account, market, proposal, { ...baseContext, posture: "avoid" });
    expect(decision.status).toBe("rejected");
    expect(decision.reason).toMatch(/avoid/i);
  });
});
