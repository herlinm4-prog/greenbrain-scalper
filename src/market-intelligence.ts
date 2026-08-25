export interface HistoricalBar {
  timestampMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export type TrendState = "strong-up" | "up" | "range" | "down" | "strong-down";
export type OpportunityPosture = "favor-long" | "favor-short" | "wait" | "avoid";

export interface HistoricalContext {
  currentPrice: number;
  periodHigh: number;
  periodLow: number;
  rangePosition: number;
  distanceFromHighFraction: number;
  distanceFromLowFraction: number;
  trend: TrendState;
  trendStrength: number;
  volatilityFraction: number;
  support: number;
  resistance: number;
  posture: OpportunityPosture;
  confidence: number;
  reasons: string[];
  cautions: string[];
}

export class MarketIntelligence {
  analyze(bars: HistoricalBar[]): HistoricalContext {
    if (bars.length < 8) throw new Error("Market intelligence requires at least 8 historical bars");
    for (const bar of bars) {
      if (bar.low <= 0 || bar.high <= 0 || bar.close <= 0 || bar.open <= 0) throw new Error("Historical prices must be positive");
      if (bar.low > bar.high) throw new Error("Historical bar low cannot exceed high");
    }

    const closes = bars.map((bar) => bar.close);
    const currentPrice = closes.at(-1)!;
    const periodHigh = Math.max(...bars.map((bar) => bar.high));
    const periodLow = Math.min(...bars.map((bar) => bar.low));
    const range = Math.max(periodHigh - periodLow, currentPrice * 1e-8);
    const rangePosition = this.clamp((currentPrice - periodLow) / range, 0, 1);

    const fastLength = Math.max(3, Math.floor(closes.length * 0.25));
    const slowLength = Math.max(fastLength + 1, Math.floor(closes.length * 0.6));
    const fast = this.mean(closes.slice(-fastLength));
    const slow = this.mean(closes.slice(-slowLength));
    const normalizedTrend = (fast - slow) / Math.max(currentPrice, 1e-8);

    const returns = closes.slice(1).map((close, index) => (close - closes[index]) / closes[index]);
    const volatilityFraction = this.stdDev(returns);
    const trendStrength = this.clamp(Math.abs(normalizedTrend) / Math.max(volatilityFraction, 1e-6), 0, 2) / 2;

    const trend: TrendState = normalizedTrend > volatilityFraction * 0.7
      ? "strong-up"
      : normalizedTrend > volatilityFraction * 0.2
        ? "up"
        : normalizedTrend < -volatilityFraction * 0.7
          ? "strong-down"
          : normalizedTrend < -volatilityFraction * 0.2
            ? "down"
            : "range";

    const recent = bars.slice(-Math.max(5, Math.floor(bars.length * 0.3)));
    const support = Math.min(...recent.map((bar) => bar.low));
    const resistance = Math.max(...recent.map((bar) => bar.high));
    const nearResistance = (resistance - currentPrice) / currentPrice < Math.max(volatilityFraction * 2.5, 0.001);
    const nearSupport = (currentPrice - support) / currentPrice < Math.max(volatilityFraction * 2.5, 0.001);

    const reasons: string[] = [];
    const cautions: string[] = [];
    let posture: OpportunityPosture = "wait";
    let confidence = 0.45 + trendStrength * 0.25;

    if ((trend === "strong-up" || trend === "up") && !nearResistance) {
      posture = "favor-long";
      reasons.push("Historical trend and recent momentum favor the upside");
    } else if ((trend === "strong-down" || trend === "down") && !nearSupport) {
      posture = "favor-short";
      reasons.push("Historical trend and recent momentum favor the downside");
    } else if (trend === "range") {
      reasons.push("Price is rotating inside a historical range");
      posture = "wait";
      confidence *= 0.8;
    }

    if (nearResistance) {
      cautions.push("Price is close to recent resistance; chasing a long entry has poorer location");
      if (posture === "favor-long") posture = "wait";
      confidence *= 0.78;
    }
    if (nearSupport) {
      cautions.push("Price is close to recent support; chasing a short entry has poorer location");
      if (posture === "favor-short") posture = "wait";
      confidence *= 0.78;
    }
    if (volatilityFraction > 0.012) {
      cautions.push("Historical volatility is elevated; position sizing should be reduced");
      confidence *= 0.8;
    }
    if (rangePosition > 0.92) cautions.push("Price is near the period high");
    if (rangePosition < 0.08) cautions.push("Price is near the period low");
    if (cautions.length >= 3) posture = "avoid";

    return {
      currentPrice,
      periodHigh,
      periodLow,
      rangePosition,
      distanceFromHighFraction: (periodHigh - currentPrice) / currentPrice,
      distanceFromLowFraction: (currentPrice - periodLow) / currentPrice,
      trend,
      trendStrength,
      volatilityFraction,
      support,
      resistance,
      posture,
      confidence: this.clamp(confidence, 0, 0.95),
      reasons,
      cautions,
    };
  }

  explain(context: HistoricalContext): string {
    const trend = context.trend.replace("strong-", "strong ").replace("-", " ");
    const location = Math.round(context.rangePosition * 100);
    const stance = context.posture === "favor-long"
      ? "GreenBrain favors long opportunities but still requires execution and risk checks."
      : context.posture === "favor-short"
        ? "GreenBrain favors short opportunities but still requires execution and risk checks."
        : context.posture === "avoid"
          ? "GreenBrain is avoiding new exposure until the market location improves."
          : "GreenBrain is waiting for a cleaner opportunity.";
    return `Trend is ${trend}; price is at ${location}% of the observed range. ${stance}`;
  }

  private mean(values: number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const average = this.mean(values);
    return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
  }
}
