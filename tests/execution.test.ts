import { describe, expect, it } from "vitest";
import {
  ExecutionLedger,
  ExecutionService,
  ForexDemoFeed,
  PaperBroker,
} from "../src/index.js";
import type { EngineDecision, SignalProposal } from "../src/index.js";

const proposal: SignalProposal = {
  id: "approved-signal",
  symbol: "EUR_USD",
  side: "buy",
  entry: 1.1,
  stopLoss: 1.099,
  takeProfit: 1.102,
  confidence: 0.75,
  rationale: ["Execution test"],
};

const approved: EngineDecision = {
  status: "approved",
  reason: "Approved",
  risk: { approved: true, reason: "Approved", units: 2_500, riskAmount: 25 },
  shadowResults: [],
};

const makeService = () => {
  const feed = new ForexDemoFeed({
    symbol: "EUR_USD",
    broker: "paper-one",
    initialMid: 1.1,
    spreadBps: 0.8,
    volatilityBps: 1,
    seed: 10,
  });
  const ledger = new ExecutionLedger();
  return { ledger, service: new ExecutionService(new PaperBroker({ id: "paper-one", slippageBps: 0.2, feed }), ledger) };
};

describe("demo execution boundary", () => {
  it("fills an approved universal order and records it", async () => {
    const { ledger, service } = makeService();
    const receipt = await service.execute(approved, proposal, 100);
    expect(receipt.status).toBe("filled");
    expect(receipt.filledPrice).toBeGreaterThan(proposal.entry);
    expect(ledger.all()).toHaveLength(1);
  });

  it("prevents a signal from being executed twice", async () => {
    const { service } = makeService();
    await service.execute(approved, proposal, 100);
    await expect(service.execute(approved, proposal, 101)).rejects.toThrow("Duplicate order id");
  });
});
