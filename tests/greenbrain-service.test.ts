import { describe, expect, it } from "vitest";
import { GreenBrainService } from "../src/index.js";

async function runTicks(service: GreenBrainService, count: number, startMs = Date.now()): Promise<void> {
  for (let i = 0; i < count; i += 1) {
    await service.tick(startMs + i * 1_200);
    const telemetry = service.getTelemetry();
    expect(telemetry.account.openPositions).toBeGreaterThanOrEqual(0);
    expect(telemetry.account.openPositions).toBeLessThanOrEqual(1);
    expect(Number.isFinite(telemetry.account.dailyPnl)).toBe(true);
  }
}

describe("GreenBrainService", () => {
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
