import { timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve } from "node:path";
import type { GreenBrainService } from "./greenbrain-service.js";

export type GreenBrainRuntimeMode = "paper" | "mt5-bridge" | "mt5-push";

export interface GreenBrainRuntimeInfo {
  brokerMode: GreenBrainRuntimeMode;
  environment: "demo";
}

export interface ApiServerConfig {
  port: number;
  host?: string;
  dashboardDir?: string;
  apiToken?: string;
  allowedOrigin?: string;
  runtime?: GreenBrainRuntimeInfo;
}

export interface ApiServerHandle {
  listen(): Promise<void>;
  close(): Promise<void>;
  address(): { port: number } | undefined;
}

export function createApiServer(service: GreenBrainService, config: ApiServerConfig): ApiServerHandle {
  const dashboardDir = resolve(config.dashboardDir ?? "dashboard");
  const server = createServer((req, res) => {
    setCors(res, config.allowedOrigin);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    void route(req, res, service, dashboardDir, config.apiToken, config.runtime);
  });

  return {
    listen: () =>
      new Promise<void>((resolveListen) => {
        server.listen(config.port, config.host ?? "127.0.0.1", resolveListen);
      }),
    close: () =>
      new Promise<void>((resolveClose, reject) => {
        server.close((error) => (error ? reject(error) : resolveClose()));
      }),
    address: () => {
      const address = server.address();
      return address && typeof address === "object" ? { port: address.port } : undefined;
    },
  };
}

function setCors(res: ServerResponse, allowedOrigin?: string): void {
  if (allowedOrigin) res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Vary", "Origin");
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  service: GreenBrainService,
  dashboardDir: string,
  apiToken?: string,
  runtime?: GreenBrainRuntimeInfo,
): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");

  try {
    if (req.method === "GET" && url.pathname === "/healthz") {
      sendJson(res, 200, {
        status: "ok",
        service: "greenbrain",
        timestampMs: Date.now(),
        ...(runtime ? { runtime } : {}),
      });
      return;
    }

    if (url.pathname.startsWith("/api/") && apiToken && !hasValidBearerToken(req, apiToken)) {
      sendJson(res, 401, { error: "GreenBrain API authentication required" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state") {
      const telemetry = service.getTelemetry();
      sendJson(res, 200, {
        settings: service.getSettings(),
        telemetry,
        outcomes: buildMoneyOutcomes(telemetry.history),
        assisted: service.getAssistedExecutionState(),
        runtime: runtime ?? { brokerMode: "paper", environment: "demo" },
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/outcomes") {
      const telemetry = service.getTelemetry();
      sendJson(res, 200, buildMoneyOutcomes(telemetry.history));
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
        const telemetry = service.getTelemetry();
        sendJson(res, 200, { ok: true, outcome: buildMoneyOutcomes(telemetry.history).latest });
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

    if (req.method === "GET") {
      const dashboardPath = dashboardAssetPath(url.pathname, dashboardDir);
      if (dashboardPath) {
        streamFile(res, dashboardPath);
        return;
      }
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, 500, { error: message(error) });
  }
}

function buildMoneyOutcomes(history: Array<{ timeIso: string; side: "BUY" | "SELL"; riskAmount: number; result: number }>) {
  const trades = history.map((row) => {
    const pnl = Number(row.result) || 0;
    const riskAmount = Math.max(0, Number(row.riskAmount) || 0);
    const outcome = pnl > 0 ? "MADE_MONEY" : pnl < 0 ? "LOST_MONEY" : "FLAT";
    return {
      ...row,
      pnl,
      netProfit: pnl,
      profitable: pnl > 0,
      outcome,
      outcomeLabel: pnl > 0 ? "MADE MONEY" : pnl < 0 ? "LOST MONEY" : "NO PROFIT / LOSS",
      rMultiple: riskAmount > 0 ? pnl / riskAmount : null,
    };
  });
  const made = trades.filter((trade) => trade.pnl > 0).reduce((sum, trade) => sum + trade.pnl, 0);
  const lost = Math.abs(trades.filter((trade) => trade.pnl < 0).reduce((sum, trade) => sum + trade.pnl, 0));
  return {
    latest: trades[0] ?? null,
    trades,
    summary: {
      closedTrades: trades.length,
      madeMoney: made,
      lostMoney: lost,
      netProfit: made - lost,
      profitableTrades: trades.filter((trade) => trade.profitable).length,
      losingTrades: trades.filter((trade) => trade.pnl < 0).length,
    },
  };
}

function hasValidBearerToken(req: IncomingMessage, token: string): boolean {
  const supplied = Buffer.from(req.headers.authorization ?? "", "utf-8");
  const expected = Buffer.from(`Bearer ${token}`, "utf-8");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function dashboardAssetPath(pathname: string, dashboardDir: string): string | undefined {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\//, "");
  if (!["index.html", "app.js", "styles.css", "effectiveness.js"].includes(relative)) return undefined;
  const filePath = resolve(dashboardDir, relative);
  return existsSync(filePath) ? filePath : undefined;
}

function streamFile(res: ServerResponse, filePath: string): void {
  const contentType = extname(filePath) === ".html"
    ? "text/html; charset=utf-8"
    : extname(filePath) === ".js"
      ? "text/javascript; charset=utf-8"
      : "text/css; charset=utf-8";
  res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!res.headersSent) sendJson(res, 500, { error: "Dashboard asset unavailable" });
    else res.destroy();
  });
  stream.pipe(res);
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
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString("utf-8");
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}
