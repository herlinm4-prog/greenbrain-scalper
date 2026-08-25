import { describe, expect, it } from "vitest";
import { AssistedExecutionControl } from "../src/automation-control.js";

describe("AssistedExecutionControl", () => {
  it("arms one fresh matching decision after user confirmation", () => {
    const control = new AssistedExecutionControl(1_000);
    control.present({
      id: "d1",
      source: "mt5",
      side: "buy",
      confidencePct: 82,
      reason: "qualified",
      riskAmount: 25,
    }, 100);

    const approval = control.confirm(200);
    expect(approval.side).toBe("buy");
    expect(control.consumeIfApproved("mt5", "sell", 250)).toBe(false);
    expect(control.consumeIfApproved("mt5", "buy", 250)).toBe(true);
    expect(control.consumeIfApproved("mt5", "buy", 251)).toBe(false);
  });

  it("expires pending decisions and approvals", () => {
    const control = new AssistedExecutionControl(100);
    control.present({
      id: "d2",
      source: "internal",
      side: "sell",
      confidencePct: 74,
      reason: "qualified",
      riskAmount: 10,
    }, 1_000);
    expect(control.state(1_101).pending).toBeUndefined();

    control.present({
      id: "d3",
      source: "internal",
      side: "sell",
      confidencePct: 74,
      reason: "qualified",
      riskAmount: 10,
    }, 2_000);
    control.confirm(2_010);
    expect(control.consumeIfApproved("internal", "sell", 2_111)).toBe(false);
  });

  it("discard clears both pending and armed state", () => {
    const control = new AssistedExecutionControl();
    control.present({
      id: "d4",
      source: "mt5",
      side: "buy",
      confidencePct: 90,
      reason: "qualified",
      riskAmount: 50,
    }, 10);
    control.confirm(20);
    control.discard();
    expect(control.state(21)).toEqual({ pending: undefined, armed: undefined });
  });
});
