import { describe, expect, it } from "vitest";
import { GreenBrainChatService, type GreenBrainChatModel } from "../src/greenbrain-chat.js";
import { ProjectRegistry } from "../src/project-registry.js";

class FakeChatModel implements GreenBrainChatModel {
  async respond() {
    return {
      message: "I can pause the demo engine after your confirmation.",
      proposedCommand: {
        type: "pause-demo-engine" as const,
        summary: "Pause demo engine",
        reason: "Requested by the user",
      },
    };
  }
}

describe("GreenBrain chat safety", () => {
  it("keeps every operational command pending until explicit confirmation", async () => {
    const chat = new GreenBrainChatService(new FakeChatModel(), 1_000);
    const result = await chat.send("Pause trading", 100);
    expect(result.command?.status).toBe("pending-confirmation");
    expect(chat.confirm(result.command?.id ?? "", 200).status).toBe("confirmed");
  });

  it("expires stale command proposals", async () => {
    const chat = new GreenBrainChatService(new FakeChatModel(), 100);
    const result = await chat.send("Pause trading", 100);
    expect(() => chat.confirm(result.command?.id ?? "", 201)).toThrow("expired");
  });
});

describe("ProjectRegistry", () => {
  it("requires testable acceptance criteria for every captured idea", () => {
    const registry = new ProjectRegistry();
    expect(() => registry.add({
      id: "idea-1",
      type: "idea",
      title: "Unspecified idea",
      description: "No acceptance criteria",
      priority: "medium",
      status: "captured",
      source: "user",
      createdAtMs: 1,
      acceptanceCriteria: [],
      relatedIds: [],
    })).toThrow("acceptance criteria");
  });
});
