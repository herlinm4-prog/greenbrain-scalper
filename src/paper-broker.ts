import type { BrokerAdapter, OrderReceipt, UniversalOrder } from "./broker.js";
import type { MarketSnapshot } from "./domain.js";
import { ForexDemoFeed } from "./simulator.js";

export interface PaperBrokerConfig {
  id: string;
  slippageBps: number;
  feed: ForexDemoFeed;
}

export class PaperBroker implements BrokerAdapter {
  readonly environment = "demo" as const;
  readonly id: string;
  private readonly orders = new Map<string, OrderReceipt>();

  constructor(private readonly config: PaperBrokerConfig) {
    this.id = config.id;
  }

  async getSnapshot(_symbol: string, timestampMs: number): Promise<MarketSnapshot> {
    return this.config.feed.next(timestampMs);
  }

  async submit(order: UniversalOrder): Promise<OrderReceipt> {
    if (this.orders.has(order.id)) {
      return {
        orderId: order.id,
        broker: this.id,
        status: "rejected",
        filledUnits: 0,
        timestampMs: order.createdAtMs,
        reason: "Duplicate order",
      };
    }

    const direction = order.side === "buy" ? 1 : -1;
    const filledPrice = order.requestedPrice * (1 + direction * this.config.slippageBps / 10_000);
    const receipt: OrderReceipt = {
      orderId: order.id,
      broker: this.id,
      status: "filled",
      filledPrice,
      filledUnits: order.units,
      timestampMs: order.createdAtMs,
    };
    this.orders.set(order.id, receipt);
    return receipt;
  }

  async cancel(orderId: string, timestampMs: number): Promise<OrderReceipt> {
    const existing = this.orders.get(orderId);
    const cannotCancel = existing?.status === "filled";
    return {
      orderId,
      broker: this.id,
      status: cannotCancel ? "rejected" : "cancelled",
      filledUnits: existing?.filledUnits ?? 0,
      timestampMs,
      ...(cannotCancel ? { reason: "Filled orders cannot be cancelled" } : {}),
    };
  }
}
