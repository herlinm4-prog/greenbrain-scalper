import { describe, expect, it } from "vitest";
import { MomentumSignalGenerator } from "../src/index.js";
import type { MarketSnapshot } from "../src/index.js";

function snapshot(mid: number, timestampMs: number): MarketSnapshot {
  return { symbol: "EURUSD", bid: mid - 0.0001, ask: mid + 0.0001, timestampMs, broker: "test" };
}

const baseConfig = { symbol: "EURUSD", lookback: 4, volatilityMultiplier: 2.2, minStopDistanceBps: 4, rewardToRisk: 1.5 };

describe("MomentumSignalGenerator", () => {
  it("returns no proposal before the lookback window is filled", () => {
    const generator = new MomentumSignalGenerator({ ...baseConfig, lookback: 5 });
    generator.observe(snapshot(1.1, 1));
    generator.observe(snapshot(1.1005, 2));
    expect(generator.propose(snapshot(1.1005, 2), 1)).toBeUndefined();
  });

  it("proposes a buy when momentum is positive", () => {
    const generator = new MomentumSignalGenerator(baseConfig);
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
    const generator = new MomentumSignalGenerator(baseConfig);
    const prices = [1.1, 1.0995, 1.099, 1.0985];
    prices.forEach((price, index) => generator.observe(snapshot(price, index)));
    const last = snapshot(prices.at(-1)!, prices.length);
    const proposal = generator.propose(last, 1)!;
    expect(proposal.side).toBe("sell");
    expect(proposal.stopLoss).toBeGreaterThan(proposal.entry);
    expect(proposal.takeProfit).toBeLessThan(proposal.entry);
  });

  it("widens the stop distance when recent volatility is higher", () => {
    const calm = new MomentumSignalGenerator(baseConfig);
    [1.1, 1.10002, 1.09999, 1.10003].forEach((price, index) => calm.observe(snapshot(price, index)));
    const calmProposal = calm.propose(snapshot(1.10003, 4), 1)!;
    const calmStopBps = Math.abs(calmProposal.entry - calmProposal.stopLoss) / calmProposal.entry * 10_000;

    const volatile = new MomentumSignalGenerator(baseConfig);
    // A choppy zigzag (not a smooth trend) so the stdev-of-returns volatility
    // measure is genuinely higher, while still ending net positive.
    [1.1, 1.103, 1.098, 1.106].forEach((price, index) => volatile.observe(snapshot(price, index)));
    const volatileProposal = volatile.propose(snapshot(1.106, 4), 1)!;
    const volatileStopBps = Math.abs(volatileProposal.entry - volatileProposal.stopLoss) / volatileProposal.entry * 10_000;

    expect(volatileStopBps).toBeGreaterThan(calmStopBps);
  });

  it("never sizes a stop below the configured floor", () => {
    const generator = new MomentumSignalGenerator({ ...baseConfig, minStopDistanceBps: 25 });
    [1.1, 1.10001, 1.10002, 1.10003].forEach((price, index) => generator.observe(snapshot(price, index)));
    const proposal = generator.propose(snapshot(1.10003, 4), 1)!;
    const stopBps = Math.abs(proposal.entry - proposal.stopLoss) / proposal.entry * 10_000;
    expect(stopBps).toBeGreaterThanOrEqual(25 - 0.01);
  });

  it("rejects invalid configuration", () => {
    expect(() => new MomentumSignalGenerator({ ...baseConfig, lookback: 2 })).toThrow();
    expect(() => new MomentumSignalGenerator({ ...baseConfig, volatilityMultiplier: 0 })).toThrow();
    expect(() => new MomentumSignalGenerator({ ...baseConfig, minStopDistanceBps: 0 })).toThrow();
    expect(() => new MomentumSignalGenerator({ ...baseConfig, rewardToRisk: 0 })).toThrow();
  });
});
