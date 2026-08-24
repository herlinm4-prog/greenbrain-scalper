import type { BrokerAdapter, OrderReceipt, UniversalOrder } from "./broker.js";
import type { MarketSnapshot } from "./domain.js";

export type Mt5TradeMode = "demo" | "contest" | "real";

export interface Mt5AccountInfo {
  login: number;
  server: string;
  broker: string;
  tradeMode: Mt5TradeMode;
  balance: number;
  equity: number;
  currency: string;
}

export interface Mt5Tick {
  symbol: string;
  bid: number;
  ask: number;
  timestampMs: number;
}

export interface Mt5OrderCheckResult {
  accepted: boolean;
  reason: string;
}

export interface Mt5OrderSendResult {
  accepted: boolean;
  ticket?: number;
  filledPrice?: number;
  filledUnits?: number;
  timestampMs: number;
  reason: string;
}

export interface Mt5BridgeTransport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  accountInfo(): Promise<Mt5AccountInfo>;
  heartbeat(): Promise<number>;
  symbolTick(symbol: string): Promise<Mt5Tick>;
  orderCheck(order: UniversalOrder, magicNumber: number): Promise<Mt5OrderCheckResult>;
  orderSend(order: UniversalOrder, magicNumber: number): Promise<Mt5OrderSendResult>;
}

export interface Mt5DemoAdapterConfig {
  id: string;
  allowedLogin: number;
  allowedServer: string;
  magicNumber: number;
  heartbeatTimeoutMs: number;
}

export class Mt5DemoAdapter implements BrokerAdapter {
  readonly environment = "demo" as const;
  readonly id: string;
  private connected = false;
  private lastHeartbeatMs = 0;
  private readonly submittedOrderIds = new Set<string>();

  constructor(
    private readonly config: Mt5DemoAdapterConfig,
    private readonly transport: Mt5BridgeTransport,
  ) {
    this.id = config.id;
  }

  async initialize(): Promise<Mt5AccountInfo> {
    await this.transport.connect();
    const account = await this.transport.accountInfo();

    if (account.tradeMode !== "demo") {
      await this.transport.disconnect();
      throw new Error("MT5 adapter rejected a non-demo account");
    }
    if (account.login !== this.config.allowedLogin) {
      await this.transport.disconnect();
      throw new Error("MT5 account is not allowlisted");
    }
    if (account.server !== this.config.allowedServer) {
      await this.transport.disconnect();
      throw new Error("MT5 server is not allowlisted");
    }

    this.lastHeartbeatMs = await this.transport.heartbeat();
    this.connected = true;
    return account;
  }

  async refreshHeartbeat(nowMs: number): Promise<void> {
    this.assertConnected();
    const heartbeatMs = await this.transport.heartbeat();
    if (heartbeatMs > nowMs + this.config.heartbeatTimeoutMs) {
      throw new Error("MT5 heartbeat timestamp is invalid");
    }
    this.lastHeartbeatMs = heartbeatMs;
  }

  async getSnapshot(symbol: string, timestampMs: number): Promise<MarketSnapshot> {
    this.assertHealthy(timestampMs);
    const tick = await this.transport.symbolTick(symbol);
    if (tick.symbol !== symbol) throw new Error("MT5 returned a tick for the wrong symbol");
    if (tick.bid <= 0 || tick.ask <= tick.bid) throw new Error("MT5 returned an invalid quote");
    return { ...tick, broker: this.id };
  }

  async submit(order: UniversalOrder): Promise<OrderReceipt> {
    this.assertHealthy(order.createdAtMs);
    if (this.submittedOrderIds.has(order.id)) {
      return this.rejected(order, "Duplicate order blocked by MT5 adapter");
    }

    this.submittedOrderIds.add(order.id);
    const check = await this.transport.orderCheck(order, this.config.magicNumber);
    if (!check.accepted) return this.rejected(order, `MT5 order_check rejected: ${check.reason}`);

    const result = await this.transport.orderSend(order, this.config.magicNumber);
    if (!result.accepted) return this.rejected(order, `MT5 order_send rejected: ${result.reason}`, result.timestampMs);

    return {
      orderId: order.id,
      broker: this.id,
      status: "filled",
      filledPrice: result.filledPrice ?? order.requestedPrice,
      filledUnits: result.filledUnits ?? order.units,
      timestampMs: result.timestampMs,
    };
  }

  async cancel(orderId: string, timestampMs: number): Promise<OrderReceipt> {
    this.assertHealthy(timestampMs);
    return {
      orderId,
      broker: this.id,
      status: "rejected",
      filledUnits: 0,
      timestampMs,
      reason: "MT5 cancellation is not enabled in the demo bridge yet",
    };
  }

  private assertConnected(): void {
    if (!this.connected) throw new Error("MT5 adapter is not initialized");
  }

  private assertHealthy(nowMs: number): void {
    this.assertConnected();
    if (nowMs - this.lastHeartbeatMs > this.config.heartbeatTimeoutMs) {
      throw new Error("MT5 heartbeat expired; new orders are blocked");
    }
  }

  private rejected(order: UniversalOrder, reason: string, timestampMs = order.createdAtMs): OrderReceipt {
    return {
      orderId: order.id,
      broker: this.id,
      status: "rejected",
      filledUnits: 0,
      timestampMs,
      reason,
    };
  }
}
