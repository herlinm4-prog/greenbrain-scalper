import { describe, expect, it } from "vitest";
import type { UniversalOrder } from "../src/broker.js";
import {
  Mt5DemoAdapter,
  type Mt5AccountInfo,
  type Mt5BridgeTransport,
} from "../src/mt5-bridge.js";

class FakeTransport implements Mt5BridgeTransport {
  heartbeatMs = 1_000;
  account: Mt5AccountInfo = {
    login: 12345,
    server: "Broker-Demo",
    broker: "Broker",
    tradeMode: "demo",
    balance: 10_000,
    equity: 10_000,
    currency: "USD",
  };
  sent = 0;

  async connect() {}
  async disconnect() {}
  async accountInfo() { return this.account; }
  async heartbeat() { return this.heartbeatMs; }
  async symbolTick(symbol: string) { return { symbol, bid: 1.1, ask: 1.1002, timestampMs: this.heartbeatMs }; }
  async orderCheck() { return { accepted: true, reason: "ok" }; }
  async orderSend(order: UniversalOrder) {
    this.sent += 1;
    return { accepted: true, ticket: 77, filledPrice: order.requestedPrice, filledUnits: order.units, timestampMs: order.createdAtMs, reason: "filled" };
  }
}

const config = {
  id: "mt5-demo",
  allowedLogin: 12345,
  allowedServer: "Broker-Demo",
  magicNumber: 260824,
  heartbeatTimeoutMs: 5_000,
};

const order: UniversalOrder = {
  id: "order-1",
  signalId: "signal-1",
  symbol: "EURUSD",
  side: "buy",
  units: 100,
  requestedPrice: 1.1,
  stopLoss: 1.099,
  takeProfit: 1.102,
  createdAtMs: 1_500,
};

describe("Mt5DemoAdapter", () => {
  it("initializes and submits only through an allowlisted demo account", async () => {
    const transport = new FakeTransport();
    const adapter = new Mt5DemoAdapter(config, transport);
    await adapter.initialize();

    const receipt = await adapter.submit(order);
    expect(receipt.status).toBe("filled");
    expect(transport.sent).toBe(1);
  });

  it("rejects a real account", async () => {
    const transport = new FakeTransport();
    transport.account = { ...transport.account, tradeMode: "real" };
    const adapter = new Mt5DemoAdapter(config, transport);

    await expect(adapter.initialize()).rejects.toThrow("non-demo");
  });

  it("fails closed when the heartbeat is stale", async () => {
    const transport = new FakeTransport();
    const adapter = new Mt5DemoAdapter(config, transport);
    await adapter.initialize();

    await expect(adapter.getSnapshot("EURUSD", 7_000)).rejects.toThrow("heartbeat expired");
  });

  it("blocks duplicate order ids before reaching MT5 twice", async () => {
    const transport = new FakeTransport();
    const adapter = new Mt5DemoAdapter(config, transport);
    await adapter.initialize();

    await adapter.submit(order);
    const duplicate = await adapter.submit(order);
    expect(duplicate.status).toBe("rejected");
    expect(transport.sent).toBe(1);
  });
});
