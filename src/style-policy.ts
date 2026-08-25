import type { RiskPolicy } from "./domain.js";
import type { EngineConfig } from "./trading-engine.js";
import type { GreenBrainSettings, TradingStyle } from "./settings-store.js";

interface StyleTuning {
  minimumConfidence: number;
  minimumSurvivalFraction: number;
  maxSpreadBps: number;
}

const STYLE_TUNING: Record<TradingStyle, StyleTuning> = {
  safe: { minimumConfidence: 0.78, minimumSurvivalFraction: 0.7, maxSpreadBps: 2 },
  balanced: { minimumConfidence: 0.7, minimumSurvivalFraction: 0.6, maxSpreadBps: 3 },
  aggressive: { minimumConfidence: 0.62, minimumSurvivalFraction: 0.5, maxSpreadBps: 4 },
};

/** Deterministic dollar-denominated risk policy driven by customer settings. */
export function riskPolicyFor(settings: GreenBrainSettings): RiskPolicy {
  const tuning = STYLE_TUNING[settings.style];
  return {
    enabled: true,
    maxRiskFraction: 0.02,
    maxDailyLossFraction: 0.2,
    maxOpenPositions: 1,
    maxSpreadBps: tuning.maxSpreadBps,
    maxRiskAmount: settings.riskPerTradeAmount,
    maxDailyLossAmount: settings.dailyLossLimit,
  };
}

/** Confidence/survival thresholds for the trading engine, tuned by trading style. */
export function engineConfigFor(settings: GreenBrainSettings): EngineConfig {
  const tuning = STYLE_TUNING[settings.style];
  return {
    minimumConfidence: tuning.minimumConfidence,
    minimumSurvivalFraction: tuning.minimumSurvivalFraction,
    shadowScenarios: [
      { name: "normal", extraSpreadBps: 0.3, slippageBps: 0.3 },
      { name: "stress", extraSpreadBps: 1.2, slippageBps: 1.5 },
    ],
  };
}
