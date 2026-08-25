import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GreenBrainService, createApiServer, type ApiServerHandle } from "../src/index.js";

describe("GreenBrain API server", () => {
  let handle: ApiServerHandle;
  let baseUrl: string;

  beforeEach(async () => {
    const service = await GreenBrainService.create({ seed: 10 });
    handle = createApiServer(service, { port: 0 });
    await handle.listen();
    baseUrl = `http://127.0.0.1:${handle.address()!.port}`;
  });

  afterEach(async () => {
    await handle.close();
  });

  it("returns settings and telemetry from GET /api/state", async () => {
    const response = await fetch(`${baseUrl}/api/state`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.settings.riskPerTradeAmount).toBe(25);
    expect(body.telemetry.decision).toBe("WAIT");
  });

  it("updates settings via POST /api/settings", async () => {
    const response = await fetch(`${baseUrl}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riskPerTradeAmount: 60 }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.settings.riskPerTradeAmount).toBe(60);
  });

  it("returns 400 for an invalid settings update", async () => {
    const response = await fetch(`${baseUrl}/api/settings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ riskPerTradeAmount: -5 }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/positive/);
  });

  it("halts automation via POST /api/emergency-stop", async () => {
    const response = await fetch(`${baseUrl}/api/emergency-stop`, { method: "POST" });
    expect(response.status).toBe(200);
    const state = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(state.telemetry.halted).toBe(true);
    expect(state.telemetry.systemState).toBe("HALTED");
  });

  it("returns a knowledge brief via GET /api/knowledge", async () => {
    const response = await fetch(`${baseUrl}/api/knowledge`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("returns 400 when calling /api/mt5/evaluate without push mode configured", async () => {
    const response = await fetch(`${baseUrl}/api/mt5/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountLogin: 1,
        accountServer: "x",
        accountTradeMode: "demo",
        symbol: "EURUSD",
        bid: 1.1,
        ask: 1.1002,
        timestampMs: Date.now(),
        equity: 10000,
        balance: 10000,
        openPositions: 0,
      }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/not configured/);
  });

  it("returns 404 for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(response.status).toBe(404);
  });
});

describe("GreenBrain API server - MT5 push mode", () => {
  let handle: ApiServerHandle;
  let baseUrl: string;
  const allowlist = { login: 42, server: "PushDemo-Server" };

  beforeEach(async () => {
    const service = await GreenBrainService.create({ mt5PushAllowlist: allowlist });
    handle = createApiServer(service, { port: 0 });
    await handle.listen();
    baseUrl = `http://127.0.0.1:${handle.address()!.port}`;
  });

  afterEach(async () => {
    await handle.close();
  });

  it("evaluates a tick over HTTP and reflects real account equity in telemetry", async () => {
    const evalResponse = await fetch(`${baseUrl}/api/mt5/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountLogin: allowlist.login,
        accountServer: allowlist.server,
        accountTradeMode: "demo",
        symbol: "EURUSD",
        bid: 1.1,
        ask: 1.1002,
        timestampMs: Date.now(),
        equity: 8_842.5,
        balance: 8_842.5,
        openPositions: 0,
      }),
    });
    expect(evalResponse.status).toBe(200);
    const decision = await evalResponse.json();
    expect(decision.action).toBe("wait");
    expect(decision.decisionId).toBeTruthy();

    const state = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(state.telemetry.account.equity).toBe(8_842.5);
    expect(state.telemetry.broker.pushModeEnabled).toBe(true);
  });

  it("rejects a non-allowlisted account over HTTP with 400", async () => {
    const response = await fetch(`${baseUrl}/api/mt5/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountLogin: 999,
        accountServer: "Other-Server",
        accountTradeMode: "demo",
        symbol: "EURUSD",
        bid: 1.1,
        ask: 1.1002,
        timestampMs: Date.now(),
        equity: 10000,
        balance: 10000,
        openPositions: 0,
      }),
    });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toMatch(/not allowlisted/);
  });

  it("full report-fill / report-close round trip over HTTP", async () => {
    const now = Date.now();
    const fillResponse = await fetch(`${baseUrl}/api/mt5/report-fill`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decisionId: "d-1",
        status: "filled",
        symbol: "EURUSD",
        side: "buy",
        ticket: 555,
        entryPrice: 1.1,
        stopLoss: 1.0988,
        takeProfit: 1.1019,
        volumeLots: 0.02,
        timestampMs: now,
      }),
    });
    expect(fillResponse.status).toBe(200);

    let state = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(state.telemetry.account.openPositions).toBe(1);

    const closeResponse = await fetch(`${baseUrl}/api/mt5/report-close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket: 555, closedAtMs: now + 30_000, exitPrice: 1.1019, realizedPnl: 3.8 }),
    });
    expect(closeResponse.status).toBe(200);

    state = await (await fetch(`${baseUrl}/api/state`)).json();
    expect(state.telemetry.account.openPositions).toBe(0);
    expect(state.telemetry.today.profit).toBe(3.8);
  });
});
