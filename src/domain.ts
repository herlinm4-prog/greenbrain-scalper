export type TradingMode = "demo" | "live-assisted" | "live-automatic";

export interface MarketSnapshot {
  symbol: string;
  bid: number;
  ask: number;
  timestampMs: number;
  broker: string;
}

export interface SignalProposal {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  entry: number;
  stopLoss: number;
  takeProfit: number;
  confidence: number;
  rationale: string[];
}

export interface AccountState {
  equity: number;
  dailyPnl: number;
  openPositions: number;
}

export interface RiskPolicy {
  enabled: boolean;
  maxRiskFraction: number;
  maxDailyLossFraction: number;
  maxOpenPositions: number;
  maxSpreadBps: number;
}

export interface RiskDecision {
  approved: boolean;
  reason: string;
  units: number;
  riskAmount: number;
}

export interface ShadowScenario {
  name: string;
  extraSpreadBps: number;
  slippageBps: number;
}

export interface ShadowResult {
  scenario: string;
  entry: number;
  rewardToRisk: number;
  survives: boolean;
}
