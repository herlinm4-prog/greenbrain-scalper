import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { GreenBrainService } from "./greenbrain-service.js";

export interface ApiServerConfig {
  port: number;
  host?: string;
}

export interface ApiServerHandle {
  listen(): Promise<void>;
  close(): Promise<void>;
  address(): { port: number } | undefined;
}

export function createApiServer(service: GreenBrainService, config: ApiServerConfig): ApiServerHandle {
  const server = createServer((req, res) => {
    setCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    void route(req, res, service);
  });

  return {
    listen: () =>
      new Promise<void>((resolve) => {
        server.listen(config.port, config.host ?? "127.0.0.1", resolve);
      }),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    address: () => {
      const address = server.address();
      return address && typeof address === "object" ? { port: address.port } : undefined;
    },
  };
}

function setCors(res: ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function route(req: IncomingMessage, res: ServerResponse, service: GreenBrainService): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  try {
    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, {
        settings: service.getSettings(),
        telemetry: service.getTelemetry(),
        assisted: service.getAssistedExecutionState(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/settings") {
      const body = await readJson(req);
      try {
        const settings = await service.updateSettings(body);
        sendJson(res, 200, { settings });
      } catch (error) {
        sendJson(res, 400, { error: message(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/assisted/confirm") {
      try {
        const assisted = service.confirmPendingDecision();
        sendJson(res, 200, { ok: true, assisted });
      } catch (error) {
        sendJson(res, 409, { error: message(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/assisted/discard") {
      const assisted = service.discardPendingDecision();
      sendJson(res, 200, { ok: true, assisted });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/emergency-stop") {
      service.emergencyStop();
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/mt5/evaluate") {
      const body = (await readJson(req)) as Parameters<GreenBrainService["evaluateExternalTick"]>[0];
      try {
        const decision = await service.evaluateExternalTick(body);
        sendJson(res, 200, decision);
      } catch (error) {
        sendJson(res, 400, { error: message(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/mt5/report-fill") {
      const body = (await readJson(req)) as Parameters<GreenBrainService["reportFill"]>[0];
      try {
        service.reportFill(body);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 400, { error: message(error) });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/mt5/report-close") {
      const body = (await readJson(req)) as Parameters<GreenBrainService["reportClose"]>[0];
      try {
        service.reportClose(body);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 400, { error: message(error) });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/knowledge") {
      const symbol = url.searchParams.get("symbol") ?? undefined;
      sendJson(res, 200, service.getKnowledgeBrief(symbol));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/knowledge") {
      const body = (await readJson(req)) as { source?: unknown; item?: unknown };
      try {
        service.addKnowledge(body.source as never, body.item as never);
        sendJson(res, 200, { ok: true });
      } catch (error) {
        sendJson(res, 400, { error: message(error) });
      }
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: message(error) });
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected server error";
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}
