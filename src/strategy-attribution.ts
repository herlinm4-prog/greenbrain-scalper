export interface StrategyTradeOutcome {
  id: string;
  strategyId: string;
  timestampMs: number;
  netReturnR: number;
  regime: string;
  outOfSample: boolean;
}

export type EdgeClassification =
  | "probable-luck"
  | "insufficient-evidence"
  | "possible-edge"
  | "statistically-supported-edge";

export interface AttributionPolicy {
  minimumTrades: number;
  minimumOutOfSampleTrades: number;
  minimumProfitFactor: number;
  maximumDrawdownR: number;
  minimumPositiveRegimeFraction: number;
  baseConfidenceZ: number;
  testedCandidateCount: number;
}

export interface StrategyAttribution {
  classification: EdgeClassification;
  sampleSize: number;
  outOfSampleSize: number;
  expectancyR: number;
  outOfSampleExpectancyR: number;
  profitFactor: number;
  maximumDrawdownR: number;
  positiveRegimeFraction: number;
  probabilityOfPositiveEdge: number;
  conservativeExpectancyR: number;
  reasons: string[];
}

export class StrategyAttributionEngine {
  evaluate(trades: StrategyTradeOutcome[], policy: AttributionPolicy): StrategyAttribution {
    this.validatePolicy(policy);
    const sampleSize = trades.length;
    const outOfSample = trades.filter((trade) => trade.outOfSample);
    const expectancyR = this.mean(trades.map((trade) => trade.netReturnR));
    const outOfSampleExpectancyR = this.mean(outOfSample.map((trade) => trade.netReturnR));
    const profitFactor = this.profitFactor(trades);
    const maximumDrawdownR = this.maximumDrawdown(trades);
    const positiveRegimeFraction = this.positiveRegimeFraction(trades);
    const standardError = this.standardError(trades.map((trade) => trade.netReturnR));
    const multipleTestingPenalty = Math.sqrt(2 * Math.log(Math.max(1, policy.testedCandidateCount)));
    const conservativeExpectancyR = standardError === 0
      ? expectancyR
      : expectancyR - (policy.baseConfidenceZ + multipleTestingPenalty) * standardError;
    const probabilityOfPositiveEdge = standardError === 0
      ? expectancyR > 0 ? 1 : 0
      : this.normalCdf(expectancyR / standardError);
    const reasons: string[] = [];

    if (sampleSize < policy.minimumTrades) reasons.push("Minimum trade sample has not been reached");
    if (outOfSample.length < policy.minimumOutOfSampleTrades) reasons.push("Out-of-sample evidence is insufficient");
    if (expectancyR <= 0) reasons.push("Net expectancy is not positive");
    if (outOfSampleExpectancyR <= 0) reasons.push("Out-of-sample expectancy is not positive");
    if (conservativeExpectancyR <= 0) reasons.push("Edge disappears after uncertainty and multiple-testing penalties");
    if (profitFactor < policy.minimumProfitFactor) reasons.push("Profit factor is below the promotion threshold");
    if (maximumDrawdownR > policy.maximumDrawdownR) reasons.push("Maximum drawdown exceeds the promotion threshold");
    if (positiveRegimeFraction < policy.minimumPositiveRegimeFraction) reasons.push("Edge is not stable across enough observed regimes");

    let classification: EdgeClassification;
    if (sampleSize < policy.minimumTrades || outOfSample.length < policy.minimumOutOfSampleTrades) {
      classification = "insufficient-evidence";
    } else if (expectancyR <= 0 || probabilityOfPositiveEdge < 0.5) {
      classification = "probable-luck";
    } else if (reasons.length > 0) {
      classification = "possible-edge";
    } else {
      classification = "statistically-supported-edge";
      reasons.push("Passed sample, uncertainty, cost-adjusted expectancy, drawdown, regime, and out-of-sample gates");
    }

    return {
      classification,
      sampleSize,
      outOfSampleSize: outOfSample.length,
      expectancyR,
      outOfSampleExpectancyR,
      profitFactor,
      maximumDrawdownR,
      positiveRegimeFraction,
      probabilityOfPositiveEdge,
      conservativeExpectancyR,
      reasons,
    };
  }

  private validatePolicy(policy: AttributionPolicy): void {
    if (policy.minimumTrades < 1 || policy.minimumOutOfSampleTrades < 1) throw new Error("Sample thresholds must be positive");
    if (policy.testedCandidateCount < 1) throw new Error("Tested candidate count must be positive");
    if (policy.baseConfidenceZ < 0) throw new Error("Confidence penalty cannot be negative");
  }

  private mean(values: number[]): number {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  private standardError(values: number[]): number {
    if (values.length < 2) return Number.POSITIVE_INFINITY;
    const mean = this.mean(values);
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
    return Math.sqrt(variance / values.length);
  }

  private profitFactor(trades: StrategyTradeOutcome[]): number {
    const gains = trades.filter((trade) => trade.netReturnR > 0).reduce((sum, trade) => sum + trade.netReturnR, 0);
    const losses = Math.abs(trades.filter((trade) => trade.netReturnR < 0).reduce((sum, trade) => sum + trade.netReturnR, 0));
    if (losses === 0) return gains > 0 ? Number.POSITIVE_INFINITY : 0;
    return gains / losses;
  }

  private maximumDrawdown(trades: StrategyTradeOutcome[]): number {
    let equity = 0;
    let peak = 0;
    let maximum = 0;
    for (const trade of [...trades].sort((a, b) => a.timestampMs - b.timestampMs)) {
      equity += trade.netReturnR;
      peak = Math.max(peak, equity);
      maximum = Math.max(maximum, peak - equity);
    }
    return maximum;
  }

  private positiveRegimeFraction(trades: StrategyTradeOutcome[]): number {
    const byRegime = new Map<string, number[]>();
    for (const trade of trades) {
      const values = byRegime.get(trade.regime) ?? [];
      values.push(trade.netReturnR);
      byRegime.set(trade.regime, values);
    }
    if (byRegime.size === 0) return 0;
    const positive = [...byRegime.values()].filter((values) => this.mean(values) > 0).length;
    return positive / byRegime.size;
  }

  private normalCdf(value: number): number {
    if (!Number.isFinite(value)) return value > 0 ? 1 : 0;
    const sign = value < 0 ? -1 : 1;
    const x = Math.abs(value) / Math.sqrt(2);
    const t = 1 / (1 + 0.3275911 * x);
    const coefficients = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
    const polynomial = (((((coefficients[4] ?? 0) * t + (coefficients[3] ?? 0)) * t + (coefficients[2] ?? 0)) * t + (coefficients[1] ?? 0)) * t + (coefficients[0] ?? 0)) * t;
    const erf = sign * (1 - polynomial * Math.exp(-x * x));
    return 0.5 * (1 + erf);
  }
}
