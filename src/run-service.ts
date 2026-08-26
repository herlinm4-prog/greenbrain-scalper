import path from "node:path";
import { GreenBrainService } from "./greenbrain-service.js";
import { createApiServer, type GreenBrainRuntimeMode } from "./api-server.js";
import { JsonFileSettingsPersistence } from "./settings-store.js";
import { Mt5DemoAdapter } from "./mt5-bridge.js";
import { Mt5HttpTransport } from "./mt5-http-transport.js";
import type { BrokerAdapter } from "./broker.js";
import type { Mt5PushAllowlist } from "./mt5-push.js";

const TICK_INTERVAL_MS = 1_200;
const PORT = Number(process.env.GREENBRAIN_API_PORT ?? 8787);
const API_TOKEN = process.env.GREENBRAIN_API_TOKEN;
const DASHBOARD_ORIGIN = process.env.GREENBRAIN_DASHBOARD_ORIGIN;

async function buildMt5PullBroker(): Promise<BrokerAdapter | undefined> {
  const mode = process.env.GREENBRAIN_BROKER ?? "paper";
  if (mode !== "mt5") return undefined;

  const bridgeUrl = requireEnv("GREENBRAIN_BRIDGE_URL");
  const token = requireEnv("GREENBRAIN_BRIDGE_TOKEN");
  const allowedLogin = Number(requireEnv("GREENBRAIN_DEMO_LOGIN"));
  const allowedServer = requireEnv("GREENBRAIN_DEMO_SERVER");
  const magicNumber = Number(process.env.GREENBRAIN_MAGIC_NUMBER ?? "260824");
  const heartbeatTimeoutMs = Number(process.env.GREENBRAIN_HEARTBEAT_TIMEOUT_MS ?? "10000");

  const transport = new Mt5HttpTransport({ baseUrl: bridgeUrl, token });
  const adapter = new Mt5DemoAdapter(
    { id: "greenbrain-mt5-demo", allowedLogin, allowedServer, magicNumber, heartbeatTimeoutMs },
    transport,
  );

  const account = await adapter.initialize();
  console.log(
    `Connected to MT5 demo account ${account.login}@${account.server} ` +
      `(${account.broker}, equity ${account.equity} ${account.currency})`,
  );
  return adapter;
}

function buildMt5PushAllowlist(): Mt5PushAllowlist | undefined {
  const login = process.env.GREENBRAIN_MT5_PUSH_LOGIN;
  const server = process.env.GREENBRAIN_MT5_PUSH_SERVER;
  if (!login || !server) return undefined;
  const parsedLogin = Number(login);
  if (!Number.isFinite(parsedLogin) || parsedLogin <= 0) {
    throw new Error("GREENBRAIN_MT5_PUSH_LOGIN must be a valid positive demo account login.");
  }
  return { login: parsedLogin, server };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for the selected MT5 connection mode.`);
  return value;
}

function runtimeMode(broker: BrokerAdapter | undefined, mt5PushAllowlist: Mt5PushAllowlist | undefined): GreenBrainRuntimeMode {
  if (mt5PushAllowlist) return "mt5-push";
  if (broker) return "mt5-bridge";
  return "paper";
}

function runtimeLabel(mode: GreenBrainRuntimeMode): string {
  if (mode === "mt5-push") return "MT5 PUSH · DEMO";
  if (mode === "mt5-bridge") return "MT5 BRIDGE · DEMO";
  return "PAPER ENGINE · DEMO";
}

async function main(): Promise<void> {
  const settingsPath = path.join(process.cwd(), "greenbrain-settings.json");
  const broker = await buildMt5PullBroker();
  const mt5PushAllowlist = buildMt5PushAllowlist();

  if (broker && mt5PushAllowlist) {
    throw new Error("Configure only one MT5 connection mode at a time: bridge or MQL5 push.");
  }

  const mode = runtimeMode(broker, mt5PushAllowlist);
  const service = await GreenBrainService.create({
    settingsPersistence: new JsonFileSettingsPersistence(settingsPath),
    ...(broker ? { broker } : {}),
    ...(mt5PushAllowlist ? { mt5PushAllowlist } : {}),
  });

  const api = createApiServer(service, {
    port: PORT,
    runtime: { brokerMode: mode, environment: "demo" },
    ...(API_TOKEN ? { apiToken: API_TOKEN } : {}),
    ...(DASHBOARD_ORIGIN ? { allowedOrigin: DASHBOARD_ORIGIN } : {}),
  });
  await api.listen();
  console.log(`GreenBrain listening on http://127.0.0.1:${PORT}`);
  console.log(`Runtime: ${runtimeLabel(mode)}`);
  if (!API_TOKEN) console.log("Remote API authentication is OFF. Keep this service loopback-only.");

  if (mt5PushAllowlist) {
    console.log("Waiting for the MT5 Expert Advisor to push demo ticks. Internal paper tick loop is disabled.");
    return;
  }

  if (!broker) console.log("MT5 is not configured; GreenBrain is running the paper engine only.");
  setInterval(() => {
    void service.tick(Date.now());
  }, TICK_INTERVAL_MS);
}

main().catch((error) => {
  console.error("GreenBrain service failed to start", error);
  process.exitCode = 1;
});
