import { describe, expect, it } from "vitest";
import type { OrderReceipt, UniversalOrder } from "../src/broker.js";
import { PositionLedger } from "../src/position-ledger.js";

const order: UniversalOrder = {
  id: "order-buy",
  signalId: "signal-buy",
  symbol: "EURUSD",
  side: "buy",
  units: 1_000,
  requestedPrice: 1.1,
  stopLoss: 1.099,
  takeProfit: 1.102,
  createdAtMs: 100,
};

const fill: OrderReceipt = {
  orderId: order.id,
  broker: "paper",
  status: "filled",
  filledPrice: 1.1,
  filledUnits: 1_000,
  timestampMs: 101,
};

describe("PositionLedger", () => {
  it("tracks unrealized and realized PnL through the position lifecycle", () => {
    const ledger = new PositionLedger();
    const opened = ledger.openFromFill(order, fill);
    expect(opened.status).toBe("open");

    const marked = ledger.mark(opened.id, 1.101);
    expect(marked.unrealizedPnl).toBeCloseTo(1);

    const closed = ledger.close(opened.id, 1.102, 200);
    expect(closed.status).toBe("closed");
    expect(closed.realizedPnl).toBeCloseTo(2);
    expect(ledger.openPositions()).toHaveLength(0);
  });

  it("does not allow a position to close twice", () => {
    const ledger = new PositionLedger();
    const opened = ledger.openFromFill(order, fill);
    ledger.close(opened.id, 1.101, 200);
    expect(() => ledger.close(opened.id, 1.102, 300)).toThrow("already closed");
  });
});
