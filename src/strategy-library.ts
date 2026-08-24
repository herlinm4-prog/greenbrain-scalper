import type { StrategyAttribution } from "./strategy-attribution.js";

export type StrategyStatus = "observation" | "hypothesis" | "candidate" | "validated" | "active" | "degraded" | "retired";

export interface StrategyResearchDocument {
  id: string;
  name: string;
  version: number;
  status: StrategyStatus;
  hypothesis: string;
  discoveredPattern: string;
  instruments: string[];
  regimes: string[];
  entryLogic: string[];
  exitLogic: string[];
  abstentionLogic: string[];
  invalidationConditions: string[];
  riskAssumptions: string[];
  failureModes: string[];
  supportingEvidence: string[];
  contradictingEvidence: string[];
  attribution: StrategyAttribution;
  parentVersionId?: string;
  createdAtMs: number;
}

export class StrategyLibrary {
  private readonly documents = new Map<string, StrategyResearchDocument>();

  add(document: StrategyResearchDocument): void {
    if (this.documents.has(document.id)) throw new Error(`Strategy document already exists: ${document.id}`);
    if (document.version < 1) throw new Error("Strategy version must be positive");
    if (document.status === "validated" || document.status === "active") {
      if (document.attribution.classification !== "statistically-supported-edge") {
        throw new Error("A strategy cannot be validated or activated without statistically supported edge");
      }
    }
    this.documents.set(document.id, structuredClone(document));
  }

  get(id: string): StrategyResearchDocument | undefined {
    const document = this.documents.get(id);
    return document ? structuredClone(document) : undefined;
  }

  all(): StrategyResearchDocument[] {
    return [...this.documents.values()].map((document) => structuredClone(document));
  }

  toMarkdown(id: string): string {
    const document = this.documents.get(id);
    if (!document) throw new Error(`Unknown strategy document: ${id}`);
    const list = (values: string[]) => values.length === 0 ? "- None recorded" : values.map((value) => `- ${value}`).join("\n");
    const probability = (document.attribution.probabilityOfPositiveEdge * 100).toFixed(1);
    return `# ${document.name}\n\n` +
      `- Version: ${document.version}\n- Status: ${document.status}\n- Edge classification: ${document.attribution.classification}\n- Estimated probability of positive edge: ${probability}%\n- Sample: ${document.attribution.sampleSize} trades\n\n` +
      `## Hypothesis\n\n${document.hypothesis}\n\n` +
      `## Discovered pattern\n\n${document.discoveredPattern}\n\n` +
      `## Instruments\n\n${list(document.instruments)}\n\n` +
      `## Regimes\n\n${list(document.regimes)}\n\n` +
      `## Entry logic\n\n${list(document.entryLogic)}\n\n` +
      `## Exit logic\n\n${list(document.exitLogic)}\n\n` +
      `## Abstention logic\n\n${list(document.abstentionLogic)}\n\n` +
      `## Invalidation conditions\n\n${list(document.invalidationConditions)}\n\n` +
      `## Risk assumptions\n\n${list(document.riskAssumptions)}\n\n` +
      `## Supporting evidence\n\n${list(document.supportingEvidence)}\n\n` +
      `## Contradicting evidence\n\n${list(document.contradictingEvidence)}\n\n` +
      `## Failure modes\n\n${list(document.failureModes)}\n`;
  }
}
