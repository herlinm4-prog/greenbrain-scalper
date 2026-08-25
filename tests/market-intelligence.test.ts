import { describe, expect, it } from "vitest";
import { MarketIntelligence, type HistoricalBar } from "../src/market-intelligence.js";

function bars(values: number[]): HistoricalBar[] {
  return values.map((close, index) => ({
    timestampMs: index * 60_000,
    open: close * 0.9998,
    high: close * 1.001,
    low: close * 0.999,
    close,
  }));
}

describe("MarketIntelligence", () => {
  it("recognizes an upward historical trend", () => {
    const intelligence = new MarketIntelligence();
    const context = intelligence.analyze(bars([1,1.002,1.004,1.006,1.008,1.01,1.012,1.014,1.016,1.018,1.02,1.022]));
    expect(["up", "strong-up"]).toContain(context.trend);
    expect(context.periodHigh).toBeGreaterThan(context.periodLow);
    expect(context.confidence).toBeGreaterThan(0);
  });

  it("rejects insufficient history", () => {
    const intelligence = new MarketIntelligence();
    expect(() => intelligence.analyze(bars([1,1.01,1.02]))).toThrow(/at least 8/i);
  });

  it("produces a plain-language explanation", () => {
    const intelligence = new MarketIntelligence();
    const context = intelligence.analyze(bars([1,1.001,1.002,1.001,1.003,1.004,1.005,1.006,1.007,1.008]));
    expect(intelligence.explain(context)).toContain("GreenBrain");
  });
});
