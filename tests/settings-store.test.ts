import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, SettingsStore, type GreenBrainSettings, type SettingsPersistence } from "../src/index.js";

class FakePersistence implements SettingsPersistence {
  saved: GreenBrainSettings | undefined;
  constructor(private readonly initial?: GreenBrainSettings) {}
  async load() {
    return this.initial;
  }
  async save(settings: GreenBrainSettings) {
    this.saved = { ...settings };
  }
}

describe("SettingsStore", () => {
  it("starts from defaults when no persistence is provided", async () => {
    const store = await SettingsStore.create();
    expect(store.get()).toEqual(DEFAULT_SETTINGS);
  });

  it("loads settings from persistence when available", async () => {
    const stored: GreenBrainSettings = { ...DEFAULT_SETTINGS, riskPerTradeAmount: 50, style: "aggressive" };
    const store = await SettingsStore.create(new FakePersistence(stored));
    expect(store.get().riskPerTradeAmount).toBe(50);
    expect(store.get().style).toBe("aggressive");
  });

  it("applies a partial patch and persists the merged result", async () => {
    const persistence = new FakePersistence();
    const store = await SettingsStore.create(persistence);
    const next = await store.update({ riskPerTradeAmount: 40 });
    expect(next.riskPerTradeAmount).toBe(40);
    expect(next.style).toBe(DEFAULT_SETTINGS.style);
    expect(persistence.saved?.riskPerTradeAmount).toBe(40);
  });

  it("ignores unknown or malformed fields in a patch", async () => {
    const store = await SettingsStore.create();
    const next = await store.update({ riskPerTradeAmount: 30, style: "not-a-style", nonsense: true });
    expect(next.riskPerTradeAmount).toBe(30);
    expect(next.style).toBe(DEFAULT_SETTINGS.style);
  });

  it("rejects a non-positive risk amount", async () => {
    const store = await SettingsStore.create();
    await expect(store.update({ riskPerTradeAmount: 0 })).rejects.toThrow(/positive/);
    expect(store.get().riskPerTradeAmount).toBe(DEFAULT_SETTINGS.riskPerTradeAmount);
  });

  it("rejects a non-positive daily loss limit", async () => {
    const store = await SettingsStore.create();
    await expect(store.update({ dailyLossLimit: -5 })).rejects.toThrow(/positive/);
  });
});
