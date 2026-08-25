export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestampMs: number;
}

export type ChatCommandType =
  | "pause-demo-engine"
  | "resume-demo-engine"
  | "set-assisted-mode"
  | "request-market-analysis"
  | "request-historical-context"
  | "request-risk-review"
  | "request-trade-history"
  | "request-learning-summary"
  | "request-knowledge-brief"
  | "request-strategy-report";

export interface ChatCommandProposal {
  id: string;
  type: ChatCommandType;
  summary: string;
  reason: string;
  createdAtMs: number;
  expiresAtMs: number;
  status: "pending-confirmation" | "confirmed" | "expired" | "cancelled";
}

export interface ChatModelResponse {
  message: string;
  proposedCommand?: {
    type: ChatCommandType;
    summary: string;
    reason: string;
  };
}

export interface GreenBrainChatModel {
  respond(messages: ChatMessage[]): Promise<ChatModelResponse>;
}

export interface ChatTurnResult {
  message: ChatMessage;
  command?: ChatCommandProposal;
}

export class GreenBrainChatService {
  private readonly history: ChatMessage[] = [];
  private readonly commands = new Map<string, ChatCommandProposal>();

  constructor(
    private readonly model: GreenBrainChatModel,
    private readonly commandTtlMs = 60_000,
  ) {}

  async send(content: string, timestampMs: number): Promise<ChatTurnResult> {
    const normalized = content.trim();
    if (normalized.length === 0) throw new Error("Chat message cannot be empty");
    if (normalized.length > 4_000) throw new Error("Chat message exceeds the maximum length");

    this.history.push({ id: `user:${timestampMs}:${this.history.length}`, role: "user", content: normalized, timestampMs });
    const response = await this.model.respond(structuredClone(this.history));
    const message: ChatMessage = {
      id: `assistant:${timestampMs}:${this.history.length}`,
      role: "assistant",
      content: response.message,
      timestampMs,
    };
    this.history.push(message);

    if (!response.proposedCommand) return { message: structuredClone(message) };
    const command: ChatCommandProposal = {
      id: `chat-command:${timestampMs}:${this.commands.size}`,
      type: response.proposedCommand.type,
      summary: response.proposedCommand.summary,
      reason: response.proposedCommand.reason,
      createdAtMs: timestampMs,
      expiresAtMs: timestampMs + this.commandTtlMs,
      status: "pending-confirmation",
    };
    this.commands.set(command.id, command);
    return { message: structuredClone(message), command: structuredClone(command) };
  }

  confirm(commandId: string, timestampMs: number): ChatCommandProposal {
    const command = this.commands.get(commandId);
    if (!command) throw new Error(`Unknown chat command: ${commandId}`);
    if (command.status !== "pending-confirmation") throw new Error(`Chat command is not pending: ${commandId}`);
    if (timestampMs > command.expiresAtMs) {
      command.status = "expired";
      throw new Error("Chat command expired before confirmation");
    }
    command.status = "confirmed";
    return structuredClone(command);
  }

  cancel(commandId: string): ChatCommandProposal {
    const command = this.commands.get(commandId);
    if (!command) throw new Error(`Unknown chat command: ${commandId}`);
    if (command.status !== "pending-confirmation") throw new Error(`Chat command is not pending: ${commandId}`);
    command.status = "cancelled";
    return structuredClone(command);
  }

  messages(): ChatMessage[] {
    return structuredClone(this.history);
  }
}
