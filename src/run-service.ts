import path from "node:path";
import { GreenBrainService } from "./greenbrain-service.js";
import { createApiServer } from "./api-server.js";
import { JsonFileSettingsPersistence } from "./settings-store.js";

const TICK_INTERVAL_MS = 1_200;
const PORT = Number(process.env.GREENBRAIN_API_PORT ?? 8787);

async function main(): Promise<void> {
  const settingsPath = path.join(process.cwd(), "greenbrain-settings.json");
  const service = await GreenBrainService.create({
    settingsPersistence: new JsonFileSettingsPersistence(settingsPath),
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
