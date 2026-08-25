import path from "node:path";
import { GreenBrainService } from "./greenbrain-service.js";
import { createApiServer } from "./api-server.js";
import { JsonFileSettingsPersistence } from "./settings-store.js";
import { Mt5DemoAdapter } from "./mt5-bridge.js";
import { Mt5HttpTransport } from "./mt5-http-transport.js";
import type { BrokerAdapter } from "./broker.js";
import type { Mt5PushAllowlist } from "./mt5-push.js";

const TICK_INTERVAL_MS = 1_200;
const PORT = Number(process.env.GREENBRAIN_API_PORT ?? 8787);

/**
 * Builds a real MT5 broker adapter when GREENBRAIN_BROKER=mt5 and the
 * required bridge environment variables are present. Every variable name
 * matches bridge/mt5_bridge.py exactly so the same values can be set on
 * both sides. Returns undefined (falling back to the safe paper/demo
 * simulator) when GREENBRAIN_BROKER is unset or "paper".
 *
 * This requires a real Windows machine or VPS running bridge/mt5_bridge.py
 * (the MetaTrader5 Python package is Windows-only). It never enables
 * live-money trading: Mt5DemoAdapter.initialize() hard-rejects any account
 * whose trade_mode is not "demo", and rejects any login/server that
 * doesn't match the allowlist below.
 */
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
  // eslint-disable-next-line no-console
  console.log(
    `Connected to real MT5 demo account ${account.login}@${account.server} ` +
      `(${account.broker}, equity ${account.equity} ${account.currency})`,
  );
  return adapter;
}

/**
 * Enables the MQL5 push integration when GREENBRAIN_MT5_PUSH_LOGIN and
 * GREENBRAIN_MT5_PUSH_SERVER are both set. This is the Mac-friendly path:
 * an Expert Advisor running inside the real MT5 terminal (even a
 * Mac-wrapped one, since the terminal itself is genuine MT5) calls
 * POST /api/mt5/evaluate, /report-fill, /report-close directly - no
 * Windows and no Python bridge required. When this is active, the internal
 * tick loop below is skipped: the EA's HTTP calls drive the service instead.
 */
function buildMt5PushAllowlist(): Mt5PushAllowlist | undefined {
  const login = process.env.GREENBRAIN_MT5_PUSH_LOGIN;
  const server = process.env.GREENBRAIN_MT5_PUSH_SERVER;
  if (!login || !server) return undefined;
  return { login: Number(login), server };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is required when GREENBRAIN_BROKER=mt5. Set it to the same value used by bridge/mt5_bridge.py.`,
    );
  }
  return value;
}

async function main(): Promise<void> {
  const settingsPath = path.join(process.cwd(), "greenbrain-settings.json");
  const broker = await buildMt5PullBroker();
  const mt5PushAllowlist = buildMt5PushAllowlist();

  if (broker && mt5PushAllowlist) {
    throw new Error(
      "Configure either GREENBRAIN_BROKER=mt5 (Windows bridge) or GREENBRAIN_MT5_PUSH_LOGIN/SERVER (MQL5 EA), not both.",
    );
  }

  const service = await GreenBrainService.create({
    settingsPersistence: new JsonFileSettingsPersistence(settingsPath),
    ...(broker ? { broker } : {}),
    ...(mt5PushAllowlist ? { mt5PushAllowlist } : {}),
  });

  const api = createApiServer(service, { port: PORT });
  await api.listen();
  // eslint-disable-next-line no-console
  console.log(`GreenBrain API listening on http://127.0.0.1:${PORT}`);

  if (mt5PushAllowlist) {
    // eslint-disable-next-line no-console
    console.log("MT5 push mode active: waiting for the Expert Advisor to call /api/mt5/evaluate. Internal tick loop disabled.");
    return;
  }

  setInterval(() => {
    void service.tick(Date.now());
  }, TICK_INTERVAL_MS);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("GreenBrain service failed to start", error);
  process.exitCode = 1;
});
