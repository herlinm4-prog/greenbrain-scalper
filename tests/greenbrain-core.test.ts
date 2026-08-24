import { describe, expect, it } from "vitest";
import { ExecutionLedger } from "../src/execution-ledger.js";
import { ExecutionService } from "../src/execution-service.js";
import { GreenBrainCore } from "../src/greenbrain-core.js";
import { PaperBroker } from "../src/paper-broker.js";
import { PositionLedger } from "../src/position-ledger.js";
import { ForexDemoFeed } from "../src/simulator.js";
import { TradingEngine } from "../src/trading-engine.js";
import { InMemoryJournalStore, TradingJournal } from "../src/trading-journal.js";

const request = {
  tradingMode: "demo" as const,
  automationMode: "automatic" as const,
  policy: {
    enabled: true,
    maxRiskFraction: 0.001,
    maxDailyLossFraction: 0.02,
    maxOpenPositions: 2,
    maxSpreadBps: 5,
  },
  account: { equity: 10_000, dailyPnl: 0, openPositions: 0 },
  market: { symbol: "EURUSD", bid: 1.1, ask: 1.1002, timestampMs: 1_000, broker: "paper" },
  proposal: {
    id: "core-signal",
    symbol: "EURUSD",
    side: "buy" as const,
    entry: 1.1002,
    stopLoss: 1.0992,
    takeProfit: 1.1032,
    confidence: 0.9,
    rationale: ["test"],
  },
  timestampMs: 1_000,
};

const makeCore = () => {
  const store = new InMemoryJournalStore();
  const journal = new TradingJournal(store);
  const engine = new TradingEngine({
    minimumConfidence: 0.7,
    minimumSurvivalFraction: 0.5,
    shadowScenarios: [{ name: "base", extraSpreadBps: 0, slippageBps: 0 }],
  });
  const broker = new PaperBroker({
    id: "paper",
    slippageBps: 0,
    feed: new ForexDemoFeed({ symbol: "EURUSD", broker: "paper", initialMid: 1.1, spreadBps: 1, volatilityBps: 1, seed: 7 }),
  });
  const positions = new PositionLedger();
  const execution = new ExecutionService(broker, new ExecutionLedger(), positions, journal);
  return { core: new GreenBrainCore(engine, execution, journal), journal, positions };
};

describe("GreenBrainCore", () => {
  it("executes an approved automatic demo decision and journals the lifecycle", async () => {
    const { core, journal, positions } = makeCore();
    const result = await core.processSignal(request);

    expect(result.executionStatus).toBe("executed");
    expect(result.receipt?.status).toBe("filled");
    expect(positions.openPositions()).toHaveLength(1);
    expect(await journal.events()).toHaveLength(4);
  });

  it("holds an approved assisted decision until explicit confirmation", async () => {
    const { core, journal, positions } = makeCore();
    const result = await core.processSignal({ ...request, automationMode: "assisted", proposal: { ...request.proposal, id: "assisted-signal" } });

    expect(result.executionStatus).toBe("awaiting-confirmation");
    expect(positions.openPositions()).toHaveLength(0);
    expect(await journal.events()).toHaveLength(1);
  });

  it("re-evaluates current conditions before confirming an assisted decision", async () => {
    const { core } = makeCore();
    const assistedProposal = { ...request.proposal, id: "stale-assisted-signal" };
    const initial = await core.processSignal({ ...request, automationMode: "assisted", proposal: assistedProposal });
    expect(initial.executionStatus).toBe("awaiting-confirmation");

    await expect(core.confirmAssisted({
      tradingMode: "demo",
      policy: request.policy,
      account: request.account,
      market: { ...request.market, bid: 1.1, ask: 1.102 },
      proposal: assistedProposal,
      timestampMs: 2_000,
    })).rejects.toThrow("failed current checks");
  });
});
