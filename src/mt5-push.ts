import type { Mt5TradeMode } from "./mt5-bridge.js";

/** Sent by the MQL5 Expert Advisor on every evaluation tick. */
export interface Mt5PushSnapshot {
  accountLogin: number;
  accountServer: string;
  accountTradeMode: Mt5TradeMode;
  symbol: string;
  bid: number;
  ask: number;
  timestampMs: number;
  equity: number;
  balance: number;
  openPositions: number;
}

export type Mt5PushAction = "buy" | "sell" | "wait";

/** Returned to the EA; the EA does its own MT5-native lot sizing and order placement. */
export interface Mt5PushDecision {
  decisionId: string;
  action: Mt5PushAction;
  reason: string;
  confidencePct: number;
  entry?: number;
  stopLoss?: number;
  takeProfit?: number;
  riskAmount?: number;
}

/** Sent by the EA right after it tries to place the order MT5-side. */
export interface Mt5PushFillReport {
  decisionId: string;
  status: "filled" | "rejected";
  symbol: string;
  side: "buy" | "sell";
  ticket?: number;
  entryPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
  volumeLots?: number;
  timestampMs: number;
  reason?: string;
}

/** Sent by the EA once MT5 closes a position (stop, target, or manual). */
export interface Mt5PushCloseReport {
  ticket: number;
  closedAtMs: number;
  exitPrice: number;
  realizedPnl: number;
}

export interface Mt5PushAllowlist {
  login: number;
  server: string;
}
