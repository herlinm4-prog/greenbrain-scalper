import { describe, expect, it } from "vitest";
import { ForexDemoFeed, TradingEngine } from "../src/index.js";
import type { RiskPolicy, SignalProposal } from "../src/index.js";

const policy: RiskPolicy = {
  enabled: true,
  maxRiskFraction: 0.0025,
  maxDailyLossFraction: 0.02,
  maxOpenPositions: 2,
  maxSpreadBps: 2,
};

describe("demo feed and trading engine", () => {
  it("produces deterministic demo quotes", () => {
    const config = {
      symbol: "EUR_USD",
      broker: "greenbrain-demo",
      initialMid: 1.1,
      spreadBps: 0.8,
      volatilityBps: 1.5,
      seed: 42,
    };
    const first = new ForexDemoFeed(config).next(1);
    const second = new ForexDemoFeed(config).next(1);
    expect(first).toEqual(second);
    expect(first.ask).toBeGreaterThan(first.bid);
  });

  it("rejects weak proposals before risk evaluation", () => {
    const market = new ForexDemoFeed({
      symbol: "EUR_USD",
      broker: "greenbrain-demo",
      initialMid: 1.1,
      spreadBps: 0.8,
      volatilityBps: 1,
      seed: 7,
    }).next(1);
    const proposal: SignalProposal = {
      id: "weak",
      symbol: "EUR_USD",
      side: "buy",
      entry: market.ask,
      stopLoss: market.ask - 0.001,
      takeProfit: market.ask + 0.002,
      confidence: 0.3,
      rationale: ["Test"],
    };
    const engine = new TradingEngine({
      minimumConfidence: 0.6,
      minimumSurvivalFraction: 0.5,
      shadowScenarios: [{ name: "normal", extraSpreadBps: 0.2, slippageBps: 0.2 }],
    });
    expect(engine.evaluate("demo", policy, { equity: 10_000, dailyPnl: 0, openPositions: 0 }, market, proposal).status).toBe("rejected");
  });
});
