import { describe, expect, it } from "vitest";
import { MomentumSignalGenerator } from "../src/index.js";
import type { MarketSnapshot } from "../src/index.js";

function snapshot(mid: number, timestampMs: number): MarketSnapshot {
  return { symbol: "EURUSD", bid: mid - 0.0001, ask: mid + 0.0001, timestampMs, broker: "test" };
}

describe("MomentumSignalGenerator", () => {
  it("returns no proposal before the lookback window is filled", () => {
    const generator = new MomentumSignalGenerator({ symbol: "EURUSD", lookback: 5, stopDistanceBps: 10, rewardToRisk: 1.5 });
    generator.observe(snapshot(1.1, 1));
    generator.observe(snapshot(1.1005, 2));
    expect(generator.propose(snapshot(1.1005, 2), 1)).toBeUndefined();
  });

  it("proposes a buy when momentum is positive", () => {
    const generator = new MomentumSignalGenerator({ symbol: "EURUSD", lookback: 4, stopDistanceBps: 10, rewardToRisk: 1.5 });
    const prices = [1.1, 1.1005, 1.101, 1.1015];
    prices.forEach((price, index) => generator.observe(snapshot(price, index)));
    const last = snapshot(prices.at(-1)!, prices.length);
    const proposal = generator.propose(last, 1)!;
    expect(proposal.side).toBe("buy");
    expect(proposal.stopLoss).toBeLessThan(proposal.entry);
    expect(proposal.takeProfit).toBeGreaterThan(proposal.entry);
    expect(proposal.confidence).toBeGreaterThan(0);
    expect(proposal.confidence).toBeLessThanOrEqual(0.95);
  });

  it("proposes a sell when momentum is negative", () => {
    const generator = new MomentumSignalGenerator({ symbol: "EURUSD", lookback: 4, stopDistanceBps: 10, rewardToRisk: 1.5 });
    const prices = [1.1, 1.0995, 1.099, 1.0985];
    prices.forEach((price, index) => generator.observe(snapshot(price, index)));
    const last = snapshot(prices.at(-1)!, prices.length);
    const proposal = generator.propose(last, 1)!;
    expect(proposal.side).toBe("sell");
    expect(proposal.stopLoss).toBeGreaterThan(proposal.entry);
    expect(proposal.takeProfit).toBeLessThan(proposal.entry);
  });

  it("rejects invalid configuration", () => {
    expect(() => new MomentumSignalGenerator({ symbol: "EURUSD", lookback: 2, stopDistanceBps: 10, rewardToRisk: 1.5 })).toThrow();
    expect(() => new MomentumSignalGenerator({ symbol: "EURUSD", lookback: 5, stopDistanceBps: 0, rewardToRisk: 1.5 })).toThrow();
    expect(() => new MomentumSignalGenerator({ symbol: "EURUSD", lookback: 5, stopDistanceBps: 10, rewardToRisk: 0 })).toThrow();
  });
});
