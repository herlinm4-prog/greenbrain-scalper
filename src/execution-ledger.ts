import type { OrderReceipt, UniversalOrder } from "./broker.js";

export interface LedgerEntry {
  order: UniversalOrder;
  receipts: OrderReceipt[];
}

export class ExecutionLedger {
  private readonly entries = new Map<string, LedgerEntry>();

  register(order: UniversalOrder): void {
    if (this.entries.has(order.id)) throw new Error(`Duplicate order id: ${order.id}`);
    if ([...this.entries.values()].some((entry) => entry.order.signalId === order.signalId)) {
      throw new Error(`Signal already has an order: ${order.signalId}`);
    }
    this.entries.set(order.id, { order, receipts: [] });
  }

  record(receipt: OrderReceipt): void {
    const entry = this.entries.get(receipt.orderId);
    if (!entry) throw new Error(`Unknown order id: ${receipt.orderId}`);
    entry.receipts.push(receipt);
  }

  get(orderId: string): LedgerEntry | undefined {
    const entry = this.entries.get(orderId);
    return entry ? { order: { ...entry.order }, receipts: entry.receipts.map((receipt) => ({ ...receipt })) } : undefined;
  }

  all(): LedgerEntry[] {
    return [...this.entries.values()].map((entry) => ({
      order: { ...entry.order },
      receipts: entry.receipts.map((receipt) => ({ ...receipt })),
    }));
  }
}
