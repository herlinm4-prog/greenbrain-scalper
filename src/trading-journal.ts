import type { OrderReceipt, UniversalOrder } from "./broker.js";
import type { EngineDecision } from "./trading-engine.js";
import type { Position } from "./position-ledger.js";
import type { SignalProposal } from "./domain.js";

export type JournalEvent =
  | {
      id: string;
      type: "decision";
      timestampMs: number;
      proposal: SignalProposal;
      decision: EngineDecision;
    }
  | {
      id: string;
      type: "order";
      timestampMs: number;
      order: UniversalOrder;
    }
  | {
      id: string;
      type: "receipt";
      timestampMs: number;
      receipt: OrderReceipt;
    }
  | {
      id: string;
      type: "position";
      timestampMs: number;
      position: Position;
    };

export interface JournalStore {
  append(event: JournalEvent): Promise<void>;
  readAll(): Promise<JournalEvent[]>;
}

export class InMemoryJournalStore implements JournalStore {
  private readonly events: JournalEvent[] = [];
  private readonly ids = new Set<string>();

  async append(event: JournalEvent): Promise<void> {
    if (this.ids.has(event.id)) throw new Error(`Duplicate journal event: ${event.id}`);
    this.ids.add(event.id);
    this.events.push(structuredClone(event));
  }

  async readAll(): Promise<JournalEvent[]> {
    return structuredClone(this.events);
  }
}

export class TradingJournal {
  constructor(private readonly store: JournalStore) {}

  recordDecision(proposal: SignalProposal, decision: EngineDecision, timestampMs: number): Promise<void> {
    return this.store.append({
      id: `decision:${proposal.id}`,
      type: "decision",
      timestampMs,
      proposal,
      decision,
    });
  }

  recordOrder(order: UniversalOrder): Promise<void> {
    return this.store.append({
      id: `order:${order.id}`,
      type: "order",
      timestampMs: order.createdAtMs,
      order,
    });
  }

  recordReceipt(receipt: OrderReceipt): Promise<void> {
    return this.store.append({
      id: `receipt:${receipt.orderId}:${receipt.timestampMs}:${receipt.status}`,
      type: "receipt",
      timestampMs: receipt.timestampMs,
      receipt,
    });
  }

  recordPosition(position: Position, timestampMs: number): Promise<void> {
    return this.store.append({
      id: `position:${position.id}:${timestampMs}:${position.status}`,
      type: "position",
      timestampMs,
      position,
    });
  }

  events(): Promise<JournalEvent[]> {
    return this.store.readAll();
  }
}
