import { describe, expect, it } from "vitest";
import { RiskEngine, ShadowMarket } from "../src/index.js";
import type { MarketSnapshot, RiskPolicy, SignalProposal } from "../src/index.js";

const market: MarketSnapshot = {
  symbol: "EUR_USD",
  bid: 1.1,
  ask: 1.1001,
  timestampMs: 1,
  broker: "simulator",
};

const proposal: SignalProposal = {
  id: "signal-1",
  symbol: "EUR_USD",
  side: "buy",
  entry: 1.1001,
  stopLoss: 1.0991,
  takeProfit: 1.1021,
  confidence: 0.72,
  rationale: ["Synthetic test signal"],
};

const policy: RiskPolicy = {
  enabled: true,
  maxRiskFraction: 0.0025,
  maxDailyLossFraction: 0.02,
  maxOpenPositions: 2,
  maxSpreadBps: 2,
};

describe("GreenBrain Core", () => {
  it("blocks disabling risk outside demo mode", () => {
    const decision = new RiskEngine().evaluate(
      "live-automatic",
      { ...policy, enabled: false },
      { equity: 10_000, dailyPnl: 0, openPositions: 0 },
      market,
      proposal,
    );
    expect(decision.approved).toBe(false);
  });

  it("allows the explicit demo-only override", () => {
    const decision = new RiskEngine().evaluate(
      "demo",
      { ...policy, enabled: false },
      { equity: 10_000, dailyPnl: 0, openPositions: 0 },
      market,
      proposal,
    );
    expect(decision.approved).toBe(true);
  });

  it("stress tests execution costs in the shadow market", () => {
    const results = new ShadowMarket().evaluate(proposal, [
      { name: "normal", extraSpreadBps: 0.2, slippageBps: 0.2 },
      { name: "stressed", extraSpreadBps: 3, slippageBps: 4 },
    ]);
    expect(results).toHaveLength(2);
    expect(results[0]?.rewardToRisk).toBeGreaterThan(results[1]?.rewardToRisk ?? 0);
  });
});
