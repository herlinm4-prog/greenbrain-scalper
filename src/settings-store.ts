import { readFile, writeFile } from "node:fs/promises";
import type { AutomationMode } from "./greenbrain-core.js";

export type TradingStyle = "safe" | "balanced" | "aggressive";
export type { AutomationMode };

export interface GreenBrainSettings {
  riskPerTradeAmount: number;
  style: TradingStyle;
  dailyProfitGoal: number;
  dailyLossLimit: number;
  streakAlertEnabled: boolean;
  automationRunning: boolean;
  /**
   * "assisted" (default, safer): GreenBrain generates and approves a
   * decision but waits for an explicit confirm-trade call before any order
   * is placed - in paper/pull-MT5 mode that means execution is held, and
   * in MQL5 push mode the EA is told to wait until confirmed.
   * "automatic" (autopilot): approved decisions execute immediately with
   * no further confirmation. This is an explicit, visible customer choice,
   * never a silent default.
   */
  automationMode: AutomationMode;
}

export interface SettingsPatch {
  riskPerTradeAmount?: number;
  style?: TradingStyle;
  dailyProfitGoal?: number;
  dailyLossLimit?: number;
  streakAlertEnabled?: boolean;
  automationRunning?: boolean;
  automationMode?: AutomationMode;
}

export const TRADING_STYLES: TradingStyle[] = ["safe", "balanced", "aggressive"];
export const AUTOMATION_MODES: AutomationMode[] = ["assisted", "automatic"];

export const DEFAULT_SETTINGS: GreenBrainSettings = {
  riskPerTradeAmount: 25,
  style: "balanced",
  dailyProfitGoal: 100,
  dailyLossLimit: 50,
  streakAlertEnabled: true,
  automationRunning: true,
  automationMode: "assisted",
};

export interface SettingsPersistence {
  load(): Promise<GreenBrainSettings | undefined>;
  save(settings: GreenBrainSettings): Promise<void>;
}

/** Simple JSON-file persistence so customer preferences survive a restart. */
export class JsonFileSettingsPersistence implements SettingsPersistence {
  constructor(private readonly filePath: string) {}

  async load(): Promise<GreenBrainSettings | undefined> {
    try {
      const raw = await readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<GreenBrainSettings>;
      const merged = { ...DEFAULT_SETTINGS, ...parsed };
      validate(merged);
      return merged;
    } catch {
      return undefined;
    }
  }

  async save(settings: GreenBrainSettings): Promise<void> {
    await writeFile(this.filePath, JSON.stringify(settings, null, 2), "utf-8");
  }
}

export class SettingsStore {
  private current: GreenBrainSettings;

  private constructor(
    initial: GreenBrainSettings,
    private readonly persistence: SettingsPersistence | undefined,
  ) {
    this.current = { ...initial };
  }

  static async create(persistence?: SettingsPersistence): Promise<SettingsStore> {
    const loaded = await persistence?.load();
    return new SettingsStore(loaded ?? DEFAULT_SETTINGS, persistence);
  }

  get(): GreenBrainSettings {
    return { ...this.current };
  }

  async update(rawPatch: unknown): Promise<GreenBrainSettings> {
    const patch = sanitizePatch(rawPatch);
    const next: GreenBrainSettings = { ...this.current, ...patch };
    validate(next);
    if (this.persistence) await this.persistence.save(next);
    this.current = next;
    return { ...next };
  }
}

function sanitizePatch(input: unknown): SettingsPatch {
  if (typeof input !== "object" || input === null) return {};
  const record = input as Record<string, unknown>;
  const patch: SettingsPatch = {};
  if (typeof record.riskPerTradeAmount === "number") patch.riskPerTradeAmount = record.riskPerTradeAmount;
  if (typeof record.style === "string" && (TRADING_STYLES as string[]).includes(record.style)) {
    patch.style = record.style as TradingStyle;
  }
  if (typeof record.dailyProfitGoal === "number") patch.dailyProfitGoal = record.dailyProfitGoal;
  if (typeof record.dailyLossLimit === "number") patch.dailyLossLimit = record.dailyLossLimit;
  if (typeof record.streakAlertEnabled === "boolean") patch.streakAlertEnabled = record.streakAlertEnabled;
  if (typeof record.automationRunning === "boolean") patch.automationRunning = record.automationRunning;
  if (typeof record.automationMode === "string" && (AUTOMATION_MODES as string[]).includes(record.automationMode)) {
    patch.automationMode = record.automationMode as AutomationMode;
  }
  return patch;
}

function validate(settings: GreenBrainSettings): void {
  if (!Number.isFinite(settings.riskPerTradeAmount) || settings.riskPerTradeAmount <= 0) {
    throw new Error("Risk per trade must be a positive number");
  }
  if (!Number.isFinite(settings.dailyProfitGoal) || settings.dailyProfitGoal <= 0) {
    throw new Error("Daily profit goal must be a positive number");
  }
  if (!Number.isFinite(settings.dailyLossLimit) || settings.dailyLossLimit <= 0) {
    throw new Error("Daily loss limit must be a positive number");
  }
  if (!(TRADING_STYLES as string[]).includes(settings.style)) {
    throw new Error("Unknown trading style");
  }
}
