import { describe, expect, it } from "vitest";
import { InMemoryJournalStore, TradingJournal } from "../src/trading-journal.js";
import type { SignalProposal } from "../src/domain.js";
import type { EngineDecision } from "../src/trading-engine.js";

const proposal: SignalProposal = {
  id: "signal-journal",
  symbol: "EURUSD",
  side: "buy",
  entry: 1.1,
  stopLoss: 1.099,
  takeProfit: 1.102,
  confidence: 0.8,
  rationale: ["test"],
};

const decision: EngineDecision = {
  status: "rejected",
  reason: "test rejection",
  risk: { approved: false, reason: "test rejection", units: 0, riskAmount: 0 },
  shadowResults: [],
};

describe("TradingJournal", () => {
  it("records rejected decisions as first-class research evidence", async () => {
    const journal = new TradingJournal(new InMemoryJournalStore());
    await journal.recordDecision(proposal, decision, 1_000);

    const events = await journal.events();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe("decision");
  });

  it("rejects duplicate event identities", async () => {
    const journal = new TradingJournal(new InMemoryJournalStore());
    await journal.recordDecision(proposal, decision, 1_000);
    await expect(journal.recordDecision(proposal, decision, 1_000)).rejects.toThrow("Duplicate journal event");
  });
});
