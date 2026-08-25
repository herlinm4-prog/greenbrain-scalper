export type KnowledgeSourceType = "book" | "web" | "research" | "broker" | "internal";

export interface KnowledgeSource {
  id: string;
  type: KnowledgeSourceType;
  title: string;
  publisher?: string;
  url?: string;
  publishedAtMs?: number;
  retrievedAtMs: number;
  credibility: number;
}

export interface KnowledgeItem {
  id: string;
  sourceId: string;
  summary: string;
  tags: string[];
  marketSymbols: string[];
  createdAtMs: number;
  expiresAtMs?: number;
  confidence: number;
  executionRelevant: boolean;
}

export interface KnowledgeBrief {
  items: KnowledgeItem[];
  sourceCount: number;
  weightedConfidence: number;
  warnings: string[];
}

export class GreenBrainKnowledgeBase {
  private readonly sources = new Map<string, KnowledgeSource>();
  private readonly items = new Map<string, KnowledgeItem>();

  addSource(source: KnowledgeSource): void {
    if (source.credibility < 0 || source.credibility > 1) throw new Error("Source credibility must be between zero and one");
    if (!source.title.trim()) throw new Error("Knowledge source requires a title");
    if (this.sources.has(source.id)) throw new Error(`Knowledge source already exists: ${source.id}`);
    this.sources.set(source.id, structuredClone(source));
  }

  addItem(item: KnowledgeItem): void {
    if (!this.sources.has(item.sourceId)) throw new Error(`Unknown knowledge source: ${item.sourceId}`);
    if (item.confidence < 0 || item.confidence > 1) throw new Error("Knowledge confidence must be between zero and one");
    if (!item.summary.trim()) throw new Error("Knowledge item requires a summary");
    if (this.items.has(item.id)) throw new Error(`Knowledge item already exists: ${item.id}`);
    this.items.set(item.id, structuredClone(item));
  }

  brief(input: { symbol?: string; tags?: string[]; timestampMs: number }): KnowledgeBrief {
    const requestedTags = new Set((input.tags ?? []).map((tag) => tag.toLowerCase()));
    const items = [...this.items.values()].filter((item) => {
      if (item.expiresAtMs !== undefined && item.expiresAtMs < input.timestampMs) return false;
      if (input.symbol && item.marketSymbols.length && !item.marketSymbols.includes(input.symbol)) return false;
      if (requestedTags.size && !item.tags.some((tag) => requestedTags.has(tag.toLowerCase()))) return false;
      return true;
    });

    const weights = items.map((item) => {
      const source = this.sources.get(item.sourceId)!;
      return item.confidence * source.credibility;
    });
    const weightedConfidence = weights.length ? weights.reduce((sum, value) => sum + value, 0) / weights.length : 0;
    const sourceCount = new Set(items.map((item) => item.sourceId)).size;
    const warnings: string[] = [];
    if (sourceCount === 0) warnings.push("No relevant knowledge sources are available");
    if (sourceCount === 1 && items.some((item) => item.executionRelevant)) warnings.push("Execution-relevant context is supported by only one source");
    if (weightedConfidence < 0.55 && items.length) warnings.push("Relevant knowledge has low combined confidence");

    return { items: structuredClone(items), sourceCount, weightedConfidence, warnings };
  }

  source(sourceId: string): KnowledgeSource | undefined {
    const source = this.sources.get(sourceId);
    return source ? structuredClone(source) : undefined;
  }
}
