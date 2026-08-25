import path from "node:path";
import { GreenBrainService } from "./greenbrain-service.js";
import { createApiServer } from "./api-server.js";
import { JsonFileSettingsPersistence } from "./settings-store.js";
import { Mt5DemoAdapter } from "./mt5-bridge.js";
import { Mt5HttpTransport } from "./mt5-http-transport.js";
import type { BrokerAdapter } from "./broker.js";

const TICK_INTERVAL_MS = 1_200;
const PORT = Number(process.env.GREENBRAIN_API_PORT ?? 8787);

/**
 * Builds a real MT5 broker adapter when GREENBRAIN_BROKER=mt5 and the
 * required bridge environment variables are present. Every variable name
 * matches bridge/mt5_bridge.py exactly so the same values can be set on
 * both sides. Returns undefined (falling back to the safe paper/demo
 * simulator) when GREENBRAIN_BROKER is unset or "paper".
 *
 * This never enables live-money trading: Mt5DemoAdapter.initialize()
 * hard-rejects any account whose trade_mode is not "demo", and rejects
 * any login/server that doesn't match the allowlist below.
 */
async function buildMt5Broker(): Promise<BrokerAdapter | undefined> {
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

  // initialize() connects, fetches account info, and throws if the account
  // is not a demo account or is not on the allowlist. We want that failure
  // to stop the whole service from starting, not fall back silently.
  const account = await adapter.initialize();
  // eslint-disable-next-line no-console
  console.log(
    `Connected to real MT5 demo account ${account.login}@${account.server} ` +
      `(${account.broker}, equity ${account.equity} ${account.currency})`,
  );
  return adapter;
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
  const broker = await buildMt5Broker();

  const service = await GreenBrainService.create({
    settingsPersistence: new JsonFileSettingsPersistence(settingsPath),
    ...(broker ? { broker } : {}),
  });

  const api = createApiServer(service, { port: PORT });
  await api.listen();
  // eslint-disable-next-line no-console
  console.log(`GreenBrain API listening on http://127.0.0.1:${PORT}`);

  setInterval(() => {
    void service.tick(Date.now());
  }, TICK_INTERVAL_MS);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("GreenBrain service failed to start", error);
  process.exitCode = 1;
});
