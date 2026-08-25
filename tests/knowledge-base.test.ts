import { describe, expect, it } from "vitest";
import { GreenBrainKnowledgeBase } from "../src/knowledge-base.js";

describe("GreenBrainKnowledgeBase", () => {
  it("filters stale knowledge and reports source confidence", () => {
    const kb = new GreenBrainKnowledgeBase();
    kb.addSource({ id: "research", type: "research", title: "Market study", retrievedAtMs: 100, credibility: 0.9 });
    kb.addItem({ id: "fresh", sourceId: "research", summary: "Volatility expansion matters", tags: ["volatility"], marketSymbols: ["EURUSD"], createdAtMs: 100, expiresAtMs: 1000, confidence: 0.8, executionRelevant: false });
    kb.addItem({ id: "stale", sourceId: "research", summary: "Old event", tags: ["volatility"], marketSymbols: ["EURUSD"], createdAtMs: 10, expiresAtMs: 50, confidence: 0.8, executionRelevant: true });
    const brief = kb.brief({ symbol: "EURUSD", tags: ["volatility"], timestampMs: 500 });
    expect(brief.items.map((item) => item.id)).toEqual(["fresh"]);
    expect(brief.sourceCount).toBe(1);
    expect(brief.weightedConfidence).toBeGreaterThan(0.7);
  });

  it("does not accept items from unknown sources", () => {
    const kb = new GreenBrainKnowledgeBase();
    expect(() => kb.addItem({ id: "x", sourceId: "missing", summary: "x", tags: [], marketSymbols: [], createdAtMs: 0, confidence: 0.5, executionRelevant: false })).toThrow(/unknown knowledge source/i);
  });
});
