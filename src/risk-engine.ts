import type {
  AccountState,
  MarketSnapshot,
  RiskDecision,
  RiskPolicy,
  SignalProposal,
  TradingMode,
} from "./domain.js";

const bps = (fraction: number): number => fraction * 10_000;

export class RiskEngine {
  evaluate(
    mode: TradingMode,
    policy: RiskPolicy,
    account: AccountState,
    market: MarketSnapshot,
    proposal: SignalProposal,
  ): RiskDecision {
    if (!policy.enabled && mode !== "demo") {
      return this.reject("Risk engine cannot be disabled outside demo mode");
    }

    if (!policy.enabled) {
      return {
        approved: true,
        reason: "Demo-only risk override",
        units: 1,
        riskAmount: Math.abs(proposal.entry - proposal.stopLoss),
      };
    }

    if (account.equity <= 0) return this.reject("Account equity must be positive");
    if (account.openPositions >= policy.maxOpenPositions) {
      return this.reject("Maximum open positions reached");
    }

    const fractionDailyLossLimit = account.equity * policy.maxDailyLossFraction;
    const dailyLossLimit = policy.maxDailyLossAmount !== undefined
      ? Math.min(fractionDailyLossLimit, policy.maxDailyLossAmount)
      : fractionDailyLossLimit;
    if (dailyLossLimit <= 0) return this.reject("Daily loss limit must be positive");
    if (account.dailyPnl <= -dailyLossLimit) {
      return this.reject("Daily loss limit reached");
    }

    const mid = (market.bid + market.ask) / 2;
    const spreadBps = bps((market.ask - market.bid) / mid);
    if (spreadBps > policy.maxSpreadBps) return this.reject("Spread exceeds policy");

    const stopDistance = Math.abs(proposal.entry - proposal.stopLoss);
    if (stopDistance <= 0) return this.reject("Stop loss must differ from entry");

    const fractionRiskAmount = account.equity * policy.maxRiskFraction;
    const riskAmount = policy.maxRiskAmount !== undefined
      ? Math.min(fractionRiskAmount, policy.maxRiskAmount)
      : fractionRiskAmount;
    if (riskAmount <= 0) return this.reject("Risk amount must be positive");

    const units = Math.floor(riskAmount / stopDistance);
    if (units < 1) return this.reject("Calculated position is below one unit");

    return { approved: true, reason: "Approved by deterministic risk policy", units, riskAmount };
  }

  private reject(reason: string): RiskDecision {
    return { approved: false, reason, units: 0, riskAmount: 0 };
  }
}
