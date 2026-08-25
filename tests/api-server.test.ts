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

  it("returns 404 for unknown routes", async () => {
    const response = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(response.status).toBe(404);
  });
});
