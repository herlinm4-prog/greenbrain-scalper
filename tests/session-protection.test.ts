import { describe, expect, it } from "vitest";
import { SessionProtection } from "../src/session-protection.js";

describe("SessionProtection", () => {
  it("pauses after reaching the daily profit target", () => {
    const protection = new SessionProtection({ profitTargetAmount: 100, activateProfitLockAtAmount: 50, maxGivebackAmount: 25 });
    const state = protection.evaluate(110);
    expect(state.pauseNewTrades).toBe(true);
    expect(state.reason).toMatch(/profit target/i);
  });

  it("protects a profitable session from excessive giveback", () => {
    const protection = new SessionProtection({ profitTargetAmount: 200, activateProfitLockAtAmount: 50, maxGivebackAmount: 20 });
    protection.evaluate(80);
    const state = protection.evaluate(55);
    expect(state.pauseNewTrades).toBe(true);
    expect(state.peakDailyPnl).toBe(80);
  });

  it("keeps trading when giveback remains inside limits", () => {
    const protection = new SessionProtection({ profitTargetAmount: 200, activateProfitLockAtAmount: 50, maxGivebackAmount: 30 });
    protection.evaluate(75);
    expect(protection.evaluate(60).pauseNewTrades).toBe(false);
  });
});
