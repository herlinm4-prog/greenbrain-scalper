import type { FeedHealthReport } from "./market-watchdog.js";
import type { RiskAdvice } from "./risk-advisor.js";

export interface TelemetryHistoryRow {
  timeIso: string;
  side: "BUY" | "SELL";
  riskAmount: number;
  result: number;
}

export type GreenBrainDecisionLabel = "BUY" | "SELL" | "WAIT" | "PENDING" | "HALTED";
export type GreenBrainSystemState = "PROTECTED" | "PAUSED" | "HALTED" | "RISK-REVIEW";

export interface TelemetryPendingDecision {
  decisionId: string;
  side: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  riskAmount: number;
  confidencePct: number;
  reason: string;
  expiresAtMs: number;
}

export interface GreenBrainTelemetry {
  timestampMs: number;
  running: boolean;
  halted: boolean;
  systemState: GreenBrainSystemState;
  broker: { id: string; usingRealMt5: boolean; pushModeEnabled: boolean };
  feedHealth: FeedHealthReport;
  pendingDecision: TelemetryPendingDecision | undefined;
  market: { symbol: string; bid: number; ask: number; mid: number } | undefined;
  decision: GreenBrainDecisionLabel;
  confidencePct: number;
  reason: string;
  marketMemory:
    | {
        periodHigh: number;
        periodLow: number;
        rangePositionPct: number;
        volatilityBps: number;
        trend: string;
        action: string;
        text: string;
      }
    | undefined;
  account: { equity: number; dailyPnl: number; openPositions: number };
  today: { profit: number; wins: number; losses: number; winRatePct: number };
  streak: { winStreak: number; lossStreak: number };
  sessionProtection: { pauseNewTrades: boolean; reason: string; peakDailyPnl: number };
  riskAdvice: RiskAdvice | undefined;
  history: TelemetryHistoryRow[];
  log: string[];
}
