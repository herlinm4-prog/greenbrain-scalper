import { describe, expect, it } from "vitest";
import { MarketWatchdog } from "../src/market-watchdog.js";

describe("MarketWatchdog", () => {
  const watchdog = new MarketWatchdog(10_000, 30_000);

  it("allows trading only with fresh market data", () => {
    expect(watchdog.evaluate(95_000, 100_000).canTrade).toBe(true);
  });

  it("blocks trading when data becomes stale", () => {
    const report = watchdog.evaluate(80_000, 100_000);
    expect(report.status).toBe("stale");
    expect(report.canTrade).toBe(false);
  });

  it("marks a missing feed offline", () => {
    const report = watchdog.evaluate(undefined, 100_000);
    expect(report.status).toBe("offline");
    expect(report.canTrade).toBe(false);
  });
});
