import { describe, expect, it } from "vitest";
import { RiskAdvisor } from "../src/risk-advisor.js";

describe("RiskAdvisor", () => {
  it("suggests a modest review after a profitable streak without auto-changing risk", () => {
    const advice = new RiskAdvisor().advise({ currentRiskAmount: 25, dailyPnl: 70, dailyLossLimit: 100, recentNetResults: [10, 12, 9], maximumAllowedRiskAmount: 50 });
    expect(advice.state).toBe("review-increase");
    expect(advice.suggestedRiskAmount).toBe(31.25);
    expect(advice.requiresUserConfirmation).toBe(true);
  });

  it("reduces risk after consecutive losses", () => {
    const advice = new RiskAdvisor().advise({ currentRiskAmount: 40, dailyPnl: -30, dailyLossLimit: 100, recentNetResults: [20, -15, -20], maximumAllowedRiskAmount: 100 });
    expect(advice.state).toBe("reduce");
    expect(advice.suggestedRiskAmount).toBe(20);
  });

  it("stops new risk at the daily loss limit", () => {
    const advice = new RiskAdvisor().advise({ currentRiskAmount: 25, dailyPnl: -100, dailyLossLimit: 100, recentNetResults: [-25], maximumAllowedRiskAmount: 100 });
    expect(advice.state).toBe("stop");
    expect(advice.suggestedRiskAmount).toBe(0);
  });
});
