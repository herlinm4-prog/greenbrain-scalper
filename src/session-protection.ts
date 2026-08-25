export interface SessionProtectionConfig {
  profitTargetAmount: number;
  activateProfitLockAtAmount: number;
  maxGivebackAmount: number;
}

export interface SessionProtectionState {
  peakDailyPnl: number;
  pauseNewTrades: boolean;
  reason: string;
}

export class SessionProtection {
  private peakDailyPnl = 0;

  constructor(private readonly config: SessionProtectionConfig) {
    if (config.profitTargetAmount <= 0 || config.activateProfitLockAtAmount < 0 || config.maxGivebackAmount <= 0) {
      throw new Error("Session protection amounts must be valid positive values");
    }
  }

  evaluate(dailyPnl: number): SessionProtectionState {
    this.peakDailyPnl = Math.max(this.peakDailyPnl, dailyPnl);

    if (dailyPnl >= this.config.profitTargetAmount) {
      return {
        peakDailyPnl: this.peakDailyPnl,
        pauseNewTrades: true,
        reason: "Daily profit target reached; GreenBrain should protect the completed session",
      };
    }

    if (this.peakDailyPnl >= this.config.activateProfitLockAtAmount) {
      const giveback = this.peakDailyPnl - dailyPnl;
      if (giveback >= this.config.maxGivebackAmount) {
        return {
          peakDailyPnl: this.peakDailyPnl,
          pauseNewTrades: true,
          reason: "Profit lock triggered after giving back too much of the session peak",
        };
      }
    }

    return {
      peakDailyPnl: this.peakDailyPnl,
      pauseNewTrades: false,
      reason: "Session remains inside profit-protection limits",
    };
  }

  reset(): void {
    this.peakDailyPnl = 0;
  }
}
