import type { MarketSnapshot } from "./domain.js";

export type OrderStatus = "pending" | "filled" | "rejected" | "cancelled";

export interface UniversalOrder {
  id: string;
  signalId: string;
  symbol: string;
  side: "buy" | "sell";
  units: number;
  requestedPrice: number;
  stopLoss: number;
  takeProfit: number;
  createdAtMs: number;
}

export interface OrderReceipt {
  orderId: string;
  broker: string;
  status: OrderStatus;
  filledPrice?: number;
  filledUnits: number;
  timestampMs: number;
  reason?: string;
}

export interface BrokerAdapter {
  readonly id: string;
  readonly environment: "demo" | "live";
  getSnapshot(symbol: string, timestampMs: number): Promise<MarketSnapshot>;
  submit(order: UniversalOrder): Promise<OrderReceipt>;
  cancel(orderId: string, timestampMs: number): Promise<OrderReceipt>;
}
