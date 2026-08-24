import { describe, expect, it } from "vitest";
import { PatternDiscoveryRegistry } from "../src/pattern-discovery.js";
import { StrategyAttributionEngine, type StrategyTradeOutcome } from "../src/strategy-attribution.js";
import { StrategyLibrary } from "../src/strategy-library.js";

const policy = {
  minimumTrades: 30,
  minimumOutOfSampleTrades: 10,
  minimumProfitFactor: 1.2,
  maximumDrawdownR: 8,
  minimumPositiveRegimeFraction: 0.5,
  baseConfidenceZ: 1.64,
  testedCandidateCount: 5,
};

const profitableTrades = (): StrategyTradeOutcome[] => Array.from({ length: 60 }, (_, index) => ({
  id: `trade-${index}`,
  strategyId: "strategy-1",
  timestampMs: index,
  netReturnR: index % 3 === 0 ? -0.5 : 1,
  regime: index % 2 === 0 ? "trend" : "range",
  outOfSample: index >= 40,
}));

describe("strategy learning", () => {
  it("separates insufficient evidence from statistically supported edge", () => {
    const engine = new StrategyAttributionEngine();
    const insufficient = engine.evaluate(profitableTrades().slice(0, 8), policy);
    const supported = engine.evaluate(profitableTrades(), policy);

    expect(insufficient.classification).toBe("insufficient-evidence");
    expect(supported.classification).toBe("statistically-supported-edge");
    expect(supported.probabilityOfPositiveEdge).toBeGreaterThan(0.99);
  });

  it("prevents unproven candidates from being labeled validated", () => {
    const attribution = new StrategyAttributionEngine().evaluate(profitableTrades().slice(0, 8), policy);
    const library = new StrategyLibrary();
    expect(() => library.add({
      id: "strategy-doc-1",
      name: "Unproven Pattern",
      version: 1,
      status: "validated",
      hypothesis: "test",
      discoveredPattern: "test",
      instruments: ["EURUSD"],
      regimes: ["trend"],
      entryLogic: ["test"],
      exitLogic: ["test"],
      abstentionLogic: [],
      invalidationConditions: [],
      riskAssumptions: [],
      failureModes: [],
      supportingEvidence: [],
      contradictingEvidence: [],
      attribution,
      createdAtMs: 1,
    })).toThrow("statistically supported edge");
  });

  it("exports a validated strategy as a readable Markdown document", () => {
    const attribution = new StrategyAttributionEngine().evaluate(profitableTrades(), policy);
    const library = new StrategyLibrary();
    library.add({
      id: "strategy-doc-2",
      name: "Regime Momentum",
      version: 1,
      status: "validated",
      hypothesis: "Momentum persists under selected conditions.",
      discoveredPattern: "Expansion after compression.",
      instruments: ["EURUSD"],
      regimes: ["trend"],
      entryLogic: ["Enter after confirmation"],
      exitLogic: ["Exit on invalidation"],
      abstentionLogic: ["Avoid excessive spread"],
      invalidationConditions: ["No continuation"],
      riskAssumptions: ["Fixed R risk"],
      failureModes: ["False breakout"],
      supportingEvidence: ["60 cost-adjusted demo outcomes"],
      contradictingEvidence: ["Weaker during range"],
      attribution,
      createdAtMs: 1,
    });

    expect(library.toMarkdown("strategy-doc-2")).toContain("# Regime Momentum");
    expect(library.toMarkdown("strategy-doc-2")).toContain("Estimated probability of positive edge");
  });

  it("keeps unusual observations separate until they are reproducible", () => {
    const registry = new PatternDiscoveryRegistry();
    registry.record({
      id: "discovery-1",
      title: "Spread compression",
      status: "anomaly",
      detectedAtMs: 1,
      symbol: "EURUSD",
      regime: "unknown",
      description: "Spread compressed before acceleration.",
      whyUnusual: ["Below normal percentile"],
      supportingObservationIds: ["observation-1"],
      contradictingObservationIds: [],
      plausibleMechanisms: ["Liquidity concentration"],
      requiredTests: ["Replay across sessions"],
      confidence: 0.4,
    });

    expect(() => registry.promote("discovery-1", "reproducible-pattern")).toThrow("multiple supporting observations");
  });
});
