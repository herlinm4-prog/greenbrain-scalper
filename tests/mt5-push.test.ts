import { describe, expect, it } from "vitest";
import { GreenBrainService } from "../src/index.js";
import type { Mt5PushSnapshot } from "../src/index.js";

const ALLOWLIST = { login: 555111, server: "BrokerX-Demo" };

function snapshot(overrides: Partial<Mt5PushSnapshot> = {}): Mt5PushSnapshot {
  return {
    accountLogin: ALLOWLIST.login,
    accountServer: ALLOWLIST.server,
    accountTradeMode: "demo",
    symbol: "EURUSD",
    bid: 1.1,
    ask: 1.1002,
    timestampMs: Date.now(),
    equity: 12_500,
    balance: 12_500,
    openPositions: 0,
    ...overrides,
  };
}

describe("GreenBrainService MT5 push mode", () => {
  it("rejects push calls when push mode is not configured", async () => {
    const service = await GreenBrainService.create({ seed: 30 });
    await expect(service.evaluateExternalTick(snapshot())).rejects.toThrow(/not configured/);
  });

  it("rejects a non-allowlisted account", async () => {
    const service = await GreenBrainService.create({ mt5PushAllowlist: ALLOWLIST });
    await expect(
      service.evaluateExternalTick(snapshot({ accountLogin: 999999 })),
    ).rejects.toThrow(/not allowlisted/);
  });

  it("rejects a non-demo account even if the login/server match", async () => {
    const service = await GreenBrainService.create({ mt5PushAllowlist: ALLOWLIST });
    await expect(
      service.evaluateExternalTick(snapshot({ accountTradeMode: "real" })),
    ).rejects.toThrow(/Non-demo/);
  });

  it("rejects an unsupported symbol", async () => {
    const service = await GreenBrainService.create({ mt5PushAllowlist: ALLOWLIST });
    await expect(
      service.evaluateExternalTick(snapshot({ symbol: "GBPUSD" })),
    ).rejects.toThrow(/Unsupported symbol/);
  });

  it("syncs real account equity into telemetry from the EA's reported snapshot", async () => {
    const service = await GreenBrainService.create({ mt5PushAllowlist: ALLOWLIST });
    await service.evaluateExternalTick(snapshot({ equity: 13_370 }));
    expect(service.getTelemetry().account.equity).toBe(13_370);
    expect(service.getTelemetry().broker.pushModeEnabled).toBe(true);
    expect(service.getTelemetry().broker.usingRealMt5).toBe(false);
  });

  it("returns wait decisions before enough momentum context has built up", async () => {
    const service = await GreenBrainService.create({ mt5PushAllowlist: ALLOWLIST });
    const decision = await service.evaluateExternalTick(snapshot());
    expect(decision.action).toBe("wait");
    expect(decision.decisionId).toBeTruthy();
  });

  it("full lifecycle: fill report opens a position, close report journals the real outcome", async () => {
    const service = await GreenBrainService.create({ mt5PushAllowlist: ALLOWLIST });
    const now = Date.now();

    service.reportFill({
      decisionId: "mt5-push-1",
      status: "filled",
      symbol: "EURUSD",
      side: "buy",
      ticket: 90001,
      entryPrice: 1.1,
      stopLoss: 1.0988,
      takeProfit: 1.1019,
      volumeLots: 0.05,
      timestampMs: now,
    });
    expect(service.getTelemetry().account.openPositions).toBe(1);

    service.reportClose({ ticket: 90001, closedAtMs: now + 60_000, exitPrice: 1.1019, realizedPnl: 9.5 });

    const telemetry = service.getTelemetry();
    expect(telemetry.account.openPositions).toBe(0);
    expect(telemetry.today.profit).toBe(9.5);
    expect(telemetry.today.wins).toBe(1);
    expect(telemetry.history[0]!.result).toBe(9.5);
  });

  it("still records the outcome for a close report with no matching fill (e.g. after a restart)", async () => {
    const service = await GreenBrainService.create({ mt5PushAllowlist: ALLOWLIST });
    service.reportClose({ ticket: 12345, closedAtMs: Date.now(), exitPrice: 1.101, realizedPnl: -12 });
    const telemetry = service.getTelemetry();
    expect(telemetry.today.losses).toBe(1);
    expect(telemetry.today.profit).toBe(-12);
  });

  it("a rejected fill report does not open a position", async () => {
    const service = await GreenBrainService.create({ mt5PushAllowlist: ALLOWLIST });
    service.reportFill({
      decisionId: "mt5-push-2",
      status: "rejected",
      symbol: "EURUSD",
      side: "buy",
      timestampMs: Date.now(),
      reason: "Invalid stops",
    });
    expect(service.getTelemetry().account.openPositions).toBe(0);
  });

  it("respects emergency stop even mid-lifecycle", async () => {
    const service = await GreenBrainService.create({ mt5PushAllowlist: ALLOWLIST });
    service.emergencyStop();
    const decision = await service.evaluateExternalTick(snapshot());
    expect(decision.action).toBe("wait");
    expect(service.getTelemetry().halted).toBe(true);
  });
});
