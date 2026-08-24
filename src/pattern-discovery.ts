export type DiscoveryStatus = "observation" | "anomaly" | "hypothesis" | "reproducible-pattern" | "strategy-candidate";

export interface PatternDiscovery {
  id: string;
  title: string;
  status: DiscoveryStatus;
  detectedAtMs: number;
  symbol: string;
  regime: string;
  description: string;
  whyUnusual: string[];
  supportingObservationIds: string[];
  contradictingObservationIds: string[];
  plausibleMechanisms: string[];
  requiredTests: string[];
  confidence: number;
}

export class PatternDiscoveryRegistry {
  private readonly discoveries = new Map<string, PatternDiscovery>();

  record(discovery: PatternDiscovery): void {
    if (discovery.confidence < 0 || discovery.confidence > 1) throw new Error("Discovery confidence must be between zero and one");
    if (this.discoveries.has(discovery.id)) throw new Error(`Discovery already exists: ${discovery.id}`);
    this.discoveries.set(discovery.id, structuredClone(discovery));
  }

  promote(id: string, status: Exclude<DiscoveryStatus, "observation" | "anomaly">): PatternDiscovery {
    const discovery = this.discoveries.get(id);
    if (!discovery) throw new Error(`Unknown discovery: ${id}`);
    if (status === "reproducible-pattern" && discovery.supportingObservationIds.length < 2) {
      throw new Error("A reproducible pattern requires multiple supporting observations");
    }
    discovery.status = status;
    return structuredClone(discovery);
  }

  all(): PatternDiscovery[] {
    return [...this.discoveries.values()].map((discovery) => structuredClone(discovery));
  }
}
