export interface RiskAdvisorInput {
  currentRiskAmount: number;
  dailyPnl: number;
  dailyLossLimit: number;
  recentNetResults: number[];
  maximumAllowedRiskAmount: number;
}

export type RiskAdvisorState = "reduce" | "hold" | "review-increase" | "stop";

export interface RiskAdvice {
  state: RiskAdvisorState;
  suggestedRiskAmount: number;
  winStreak: number;
  lossStreak: number;
  reason: string;
  requiresUserConfirmation: boolean;
}

export class RiskAdvisor {
  advise(input: RiskAdvisorInput): RiskAdvice {
    if (input.currentRiskAmount <= 0 || input.maximumAllowedRiskAmount <= 0) throw new Error("Risk amounts must be positive");
    if (input.dailyLossLimit <= 0) throw new Error("Daily loss limit must be positive");

    const winStreak = this.trailingStreak(input.recentNetResults, (value) => value > 0);
    const lossStreak = this.trailingStreak(input.recentNetResults, (value) => value < 0);

    if (input.dailyPnl <= -input.dailyLossLimit) {
      return {
        state: "stop",
        suggestedRiskAmount: 0,
        winStreak,
        lossStreak,
        reason: "Daily loss limit reached; new risk should remain disabled",
        requiresUserConfirmation: false,
      };
    }

    if (lossStreak >= 2) {
      const reduced = Math.max(1, input.currentRiskAmount * 0.5);
      return {
        state: "reduce",
        suggestedRiskAmount: Math.min(reduced, input.currentRiskAmount),
        winStreak,
        lossStreak,
        reason: `${lossStreak} losses in a row; GreenBrain recommends reducing exposure while conditions are re-evaluated`,
        requiresUserConfirmation: true,
      };
    }

    if (winStreak >= 3 && input.dailyPnl > 0) {
      const candidate = Math.min(input.maximumAllowedRiskAmount, input.currentRiskAmount * 1.25);
      if (candidate > input.currentRiskAmount) {
        return {
          state: "review-increase",
          suggestedRiskAmount: candidate,
          winStreak,
          lossStreak,
          reason: `${winStreak} profitable trades in a row with positive daily P/L; a modest risk increase can be reviewed`,
          requiresUserConfirmation: true,
        };
      }
    }

    return {
      state: "hold",
      suggestedRiskAmount: input.currentRiskAmount,
      winStreak,
      lossStreak,
      reason: "Current results do not justify changing risk",
      requiresUserConfirmation: false,
    };
  }

  private trailingStreak(values: number[], predicate: (value: number) => boolean): number {
    let count = 0;
    for (let index = values.length - 1; index >= 0; index -= 1) {
      const value = values[index]!;
      if (!predicate(value)) break;
      count += 1;
    }
    return count;
  }
}
