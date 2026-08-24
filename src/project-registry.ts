export type RegistryItemType = "idea" | "requirement" | "defect" | "action" | "decision";
export type RegistryPriority = "critical" | "high" | "medium" | "low";
export type RegistryStatus = "captured" | "planned" | "in-progress" | "verified" | "blocked" | "rejected";

export interface ProjectRegistryItem {
  id: string;
  type: RegistryItemType;
  title: string;
  description: string;
  priority: RegistryPriority;
  status: RegistryStatus;
  source: "user" | "audit" | "system";
  createdAtMs: number;
  acceptanceCriteria: string[];
  relatedIds: string[];
}

export class ProjectRegistry {
  private readonly items = new Map<string, ProjectRegistryItem>();

  add(item: ProjectRegistryItem): void {
    if (this.items.has(item.id)) throw new Error(`Registry item already exists: ${item.id}`);
    if (item.acceptanceCriteria.length === 0) throw new Error("Registry items require acceptance criteria");
    this.items.set(item.id, structuredClone(item));
  }

  transition(id: string, status: RegistryStatus): ProjectRegistryItem {
    const item = this.items.get(id);
    if (!item) throw new Error(`Unknown registry item: ${id}`);
    if (item.status === "verified" && status !== "verified") throw new Error("Verified work cannot be reopened without a new registry item");
    item.status = status;
    return structuredClone(item);
  }

  get(id: string): ProjectRegistryItem | undefined {
    const item = this.items.get(id);
    return item ? structuredClone(item) : undefined;
  }

  openActions(): ProjectRegistryItem[] {
    return [...this.items.values()]
      .filter((item) => item.status !== "verified" && item.status !== "rejected")
      .map((item) => structuredClone(item));
  }

  all(): ProjectRegistryItem[] {
    return [...this.items.values()].map((item) => structuredClone(item));
  }
}
