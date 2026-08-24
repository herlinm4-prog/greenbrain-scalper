import type { OrderReceipt, UniversalOrder } from "./broker.js";

export type PositionStatus = "open" | "closed";

export interface Position {
  id: string;
  orderId: string;
  symbol: string;
  side: "buy" | "sell";
  units: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number;
  takeProfit: number;
  openedAtMs: number;
  closedAtMs?: number;
  exitPrice?: number;
  status: PositionStatus;
  unrealizedPnl: number;
  realizedPnl: number;
}

export class PositionLedger {
  private readonly positions = new Map<string, Position>();

  openFromFill(order: UniversalOrder, receipt: OrderReceipt): Position {
    if (receipt.status !== "filled" || receipt.filledPrice === undefined || receipt.filledUnits <= 0) {
      throw new Error("Only a valid fill can open a position");
    }
    const id = `position-${order.id}`;
    if (this.positions.has(id)) throw new Error(`Position already exists: ${id}`);

    const position: Position = {
      id,
      orderId: order.id,
      symbol: order.symbol,
      side: order.side,
      units: receipt.filledUnits,
      entryPrice: receipt.filledPrice,
      currentPrice: receipt.filledPrice,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      openedAtMs: receipt.timestampMs,
      status: "open",
      unrealizedPnl: 0,
      realizedPnl: 0,
    };
    this.positions.set(id, position);
    return { ...position };
  }

  mark(positionId: string, marketPrice: number): Position {
    if (marketPrice <= 0) throw new Error("Market price must be positive");
    const position = this.requireOpen(positionId);
    position.currentPrice = marketPrice;
    position.unrealizedPnl = this.pnl(position, marketPrice);
    return { ...position };
  }

  close(positionId: string, exitPrice: number, closedAtMs: number): Position {
    if (exitPrice <= 0) throw new Error("Exit price must be positive");
    const position = this.requireOpen(positionId);
    position.currentPrice = exitPrice;
    position.exitPrice = exitPrice;
    position.closedAtMs = closedAtMs;
    position.status = "closed";
    position.realizedPnl = this.pnl(position, exitPrice);
    position.unrealizedPnl = 0;
    return { ...position };
  }

  get(positionId: string): Position | undefined {
    const position = this.positions.get(positionId);
    return position ? { ...position } : undefined;
  }

  openPositions(): Position[] {
    return [...this.positions.values()].filter((position) => position.status === "open").map((position) => ({ ...position }));
  }

  all(): Position[] {
    return [...this.positions.values()].map((position) => ({ ...position }));
  }

  private requireOpen(positionId: string): Position {
    const position = this.positions.get(positionId);
    if (!position) throw new Error(`Unknown position: ${positionId}`);
    if (position.status !== "open") throw new Error(`Position is already closed: ${positionId}`);
    return position;
  }

  private pnl(position: Position, price: number): number {
    const direction = position.side === "buy" ? 1 : -1;
    return direction * (price - position.entryPrice) * position.units;
  }
}
