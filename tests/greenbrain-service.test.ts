import { describe, expect, it } from "vitest";
import { GreenBrainService } from "../src/index.js";
import type { BrokerAdapter, OrderReceipt, UniversalOrder } from "../src/index.js";
import type { MarketSnapshot } from "../src/index.js";

async function runTicks(service: GreenBrainService, count: number, startMs = Date.now()): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await service.tick(startMs + i * 1_200);
    const telemetry = service.getTelemetry();
    expect(telemetry.account.openPositions).toBeGreaterThanOrEqual(0);
    expect(telemetry.account.openPositions).toBeLessThanOrEqual(1);
    expect(Number.isFinite(telemetry.account.dailyPnl)).toBe(true);
  }
}

class FakeBroker implements BrokerAdapter {
  readonly environment = "demo" as const;
  readonly id = "fake-live-broker";
  snapshotCalls = 0;
  heartbeatCalls = 0;
  heartbeatShouldFail = false;

  async refreshHeartbeat(_nowMs: number): Promise<void> {
    this.heartbeatCalls += 1;
    if (this.heartbeatShouldFail) throw new Error("heartbeat expired");
  }

  async getSnapshot(symbol: string, timestampMs: number): Promise<MarketSnapshot> {
    this.snapshotCalls += 1;
    return { symbol, bid: 1.1, ask: 1.1002, timestampMs, broker: this.id };
  }

  async submit(order: UniversalOrder): Promise<OrderReceipt> {
    return { orderId: order.id, broker: this.id, status: "filled", filledPrice: order.requestedPrice, filledUnits: order.units, timestampMs: order.createdAtMs };
  }

  async cancel(orderId: string, timestampMs: number): Promise<OrderReceipt> {
    return { orderId, broker: this.id, status: "cancelled", filledUnits: 0, timestampMs };
  }
}

describe("GreenBrainService", () => {
  it("defaults to the built-in paper broker when none is injected", async () => {
    const service = await GreenBrainService.create({ seed: 20 });
    expect(service.getTelemetry().broker.usingRealMt5).toBe(false);
    expect(service.getTelemetry().broker.id).toBe("greenbrain-paper");
  });

  it("uses an injected broker adapter instead of the paper simulator", async () => {
    const broker = new FakeBroker();
    const service = await GreenBrainService.create({ broker });
    expect(service.getTelemetry().broker.usingRealMt5).toBe(true);
    expect(service.getTelemetry().broker.id).toBe("fake-live-broker");

    await service.tick(Date.now());
    expect(broker.snapshotCalls).toBe(1);
    expect(broker.heartbeatCalls).toBe(1);
    expect(service.getTelemetry().market?.symbol).toBe("EURUSD");
  });

  it("degrades to WAIT instead of crashing when the injected broker's heartbeat fails", async () => {
    const broker = new FakeBroker();
    broker.heartbeatShouldFail = true;
    const service = await GreenBrainService.create({ broker });

    await expect(service.tick(Date.now())).resolves.toBeUndefined();
    const telemetry = service.getTelemetry();
    expect(telemetry.decision).toBe("WAIT");
    expect(telemetry.reason).toMatch(/heartbeat expired/);
    expect(broker.snapshotCalls).toBe(0);
  });

  it("starts with no market data and a WAIT decision", async () => {
    const service = await GreenBrainService.create({ seed: 1 });
    const telemetry = service.getTelemetry();
    expect(telemetry.market).toBeUndefined();
    expect(telemetry.decision).toBe("WAIT");
    expect(telemetry.feedHealth.status).toBe("offline");
    expect(telemetry.halted).toBe(false);
  });

  it("ingests market data and reports a healthy feed after ticking", async () => {
    const service = await GreenBrainService.create({ seed: 2 });
    await service.tick(Date.now());
    const telemetry = service.getTelemetry();
    expect(telemetry.market).toBeDefined();
    expect(telemetry.market!.bid).toBeLessThan(telemetry.market!.ask);
    expect(telemetry.feedHealth.status).toBe("healthy");
  });

  it("defaults to assisted mode (no silent autopilot)", async () => {
    const service = await GreenBrainService.create({ seed: 50 });
    expect(service.getSettings().automationMode).toBe("assisted");
  });

  it("assisted mode holds an approved decision for confirmation instead of executing it", async () => {
    const service = await GreenBrainService.create({ seed: 51 });
    await service.updateSettings({ style: "aggressive" });
    let sawPending = false;
    for (let i = 0; i < 60 && !sawPending; i += 1) {
      await service.tick(Date.now() + i * 1_200);
      if (service.getTelemetry().decision === "PENDING") sawPending = true;
    }
    expect(sawPending).toBe(true);
    const telemetry = service.getTelemetry();
    expect(telemetry.pendingDecision).toBeDefined();
    expect(telemetry.account.openPositions).toBe(0);
  });

  it("confirming a pending decision executes it", async () => {
    const service = await GreenBrainService.create({ seed: 51 });
    await service.updateSettings({ style: "aggressive" });
    for (let i = 0; i < 60 && service.getTelemetry().decision !== "PENDING"; i += 1) {
      await service.tick(Date.now() + i * 1_200);
    }
    expect(service.getTelemetry().decision).toBe("PENDING");

    const result = await service.confirmPendingTrade();
    expect(result.confirmed).toBe(true);
    const telemetry = service.getTelemetry();
    expect(telemetry.account.openPositions).toBe(1);
    expect(telemetry.pendingDecision).toBeUndefined();
    expect(["BUY", "SELL"]).toContain(telemetry.decision);
  });

  it("dismissing a pending decision cancels it without executing", async () => {
    const service = await GreenBrainService.create({ seed: 51 });
    await service.updateSettings({ style: "aggressive" });
    for (let i = 0; i < 60 && service.getTelemetry().decision !== "PENDING"; i += 1) {
      await service.tick(Date.now() + i * 1_200);
    }
    expect(service.getTelemetry().decision).toBe("PENDING");

    const result = service.dismissPendingTrade();
    expect(result.dismissed).toBe(true);
    const telemetry = service.getTelemetry();
    expect(telemetry.account.openPositions).toBe(0);
    expect(telemetry.pendingDecision).toBeUndefined();
    expect(telemetry.decision).toBe("WAIT");
  });

  it("confirming or dismissing with nothing pending is a safe no-op", async () => {
    const service = await GreenBrainService.create({ seed: 52 });
    const confirmResult = await service.confirmPendingTrade();
    expect(confirmResult.confirmed).toBe(false);
    const dismissResult = service.dismissPendingTrade();
    expect(dismissResult.dismissed).toBe(false);
  });

  it("an unconfirmed decision auto-expires and GreenBrain resumes scanning", async () => {
    const service = await GreenBrainService.create({ seed: 51 });
    await service.updateSettings({ style: "aggressive" });
    let pendingAtMs = 0;
    let originalDecisionId = "";
    for (let i = 0; i < 60; i += 1) {
      const nowMs = Date.now() + i * 1_200;
      await service.tick(nowMs);
      const telemetry = service.getTelemetry();
      if (telemetry.decision === "PENDING") {
        pendingAtMs = nowMs;
        originalDecisionId = telemetry.pendingDecision!.decisionId;
        break;
      }
    }
    expect(pendingAtMs).toBeGreaterThan(0);

    // Jump far past the confirmation window without confirming. GreenBrain
    // should discard the stale decision and resume scanning - it may
    // immediately find and hold a *new* opportunity, which is fine; what
    // must never happen is the original stale decision silently executing
    // or lingering forever.
    await service.tick(pendingAtMs + 120_000);
    const telemetry = service.getTelemetry();
    expect(telemetry.pendingDecision?.decisionId).not.toBe(originalDecisionId);
    expect(telemetry.account.openPositions).toBe(0);
  });

  it("automatic mode (explicit opt-in) still executes approved decisions directly", async () => {
    const service = await GreenBrainService.create({ seed: 51 });
    await service.updateSettings({ automationMode: "automatic", style: "aggressive" });
    let executed = false;
    for (let i = 0; i < 60 && !executed; i += 1) {
      await service.tick(Date.now() + i * 1_200);
      if (service.getTelemetry().account.openPositions === 1) executed = true;
    }
    expect(executed).toBe(true);
    expect(service.getTelemetry().pendingDecision).toBeUndefined();
  });

  it("never opens more than one position and keeps daily P/L finite over many ticks", async () => {
    const service = await GreenBrainService.create({ seed: 42 });
    await runTicks(service, 250);
  });

  it("emergency stop halts all future decisions", async () => {
    const service = await GreenBrainService.create({ seed: 3 });
    await runTicks(service, 20);
    service.emergencyStop();

    const beforeMarket = service.getTelemetry().market;
    await service.tick(Date.now());
    const telemetry = service.getTelemetry();

    expect(telemetry.halted).toBe(true);
    expect(telemetry.running).toBe(false);
    expect(telemetry.systemState).toBe("HALTED");
    expect(telemetry.decision).toBe("HALTED");
    // No new market data should be ingested once halted.
    expect(telemetry.market).toEqual(beforeMarket);
  });

  it("pausing automation stops ticking without touching market state", async () => {
    const service = await GreenBrainService.create({ seed: 4 });
    await service.updateSettings({ automationRunning: false });
    await service.tick(Date.now());
    const telemetry = service.getTelemetry();
    expect(telemetry.running).toBe(false);
    expect(telemetry.systemState).toBe("PAUSED");
    expect(telemetry.market).toBeUndefined();
  });

  it("updates and persists customer-facing settings", async () => {
    const service = await GreenBrainService.create({ seed: 5 });
    const next = await service.updateSettings({ riskPerTradeAmount: 75, style: "aggressive", dailyProfitGoal: 200 });
    expect(next.riskPerTradeAmount).toBe(75);
    expect(next.style).toBe("aggressive");
    expect(service.getSettings().dailyProfitGoal).toBe(200);
  });

  it("rejects an invalid settings update and keeps prior settings", async () => {
    const service = await GreenBrainService.create({ seed: 6 });
    const before = service.getSettings();
    await expect(service.updateSettings({ riskPerTradeAmount: -10 })).rejects.toThrow();
    expect(service.getSettings()).toEqual(before);
  });

  it("exposes a provenance-aware knowledge brief seeded with an internal risk note", () => {
    const servicePromise = GreenBrainService.create({ seed: 7 });
    return servicePromise.then((service) => {
      const brief = service.getKnowledgeBrief();
      expect(brief.items.length).toBeGreaterThan(0);
      expect(brief.sourceCount).toBeGreaterThan(0);
    });
  });

  it("accepts controlled knowledge ingestion with provenance", async () => {
    const service = await GreenBrainService.create({ seed: 8 });
    service.addKnowledge(
      {
        id: "web-1",
        type: "web",
        title: "Example market note",
        url: "https://example.com/note",
        retrievedAtMs: Date.now(),
        credibility: 0.6,
      },
      {
        id: "item-1",
        sourceId: "web-1",
        summary: "Example summary for testing ingestion.",
        tags: ["test"],
        marketSymbols: [],
        createdAtMs: Date.now(),
        confidence: 0.5,
        executionRelevant: false,
      },
    );
    const brief = service.getKnowledgeBrief();
    expect(brief.items.some((item) => item.id === "item-1")).toBe(true);
  });
});
