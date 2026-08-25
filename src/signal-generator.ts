import type { MarketSnapshot, SignalProposal } from "./domain.js";

export interface SignalGeneratorConfig {
  symbol: string;
  lookback: number;
  /**
   * ATR-style volatility multiplier applied to recent realized volatility
   * to size the stop distance. Professional volatility-based position
   * sizing typically uses a 1.5x-3x multiplier on a volatility measure
   * (ATR or realized-return stdev) so stops widen automatically in choppy
   * markets and tighten in calm ones, keeping dollar risk consistent.
   */
  volatilityMultiplier: number;
  /** Floor so a near-zero-volatility tick never produces a degenerate stop. */
  minStopDistanceBps: number;
  rewardToRisk: number;
}

/**
 * Demo-only momentum signal generator with volatility-adjusted stop
 * distance. This is intentionally simple and transparent: it exists to
 * exercise the full decision pipeline (confidence, historical-context
 * gate, risk, shadow-market) end to end while the project's richer
 * strategy library / pattern discovery are wired in later.
 */
export class MomentumSignalGenerator {
  private readonly recentMids: number[] = [];

  constructor(private readonly config: SignalGeneratorConfig) {
    if (config.lookback < 3) throw new Error("Lookback must be at least 3 ticks");
    if (config.volatilityMultiplier <= 0) throw new Error("Volatility multiplier must be positive");
    if (config.minStopDistanceBps <= 0) throw new Error("Minimum stop distance must be positive");
    if (config.rewardToRisk <= 0) throw new Error("Reward to risk must be positive");
  }

  observe(market: MarketSnapshot): void {
    const mid = (market.bid + market.ask) / 2;
    this.recentMids.push(mid);
    if (this.recentMids.length > this.config.lookback) this.recentMids.shift();
  }

  propose(market: MarketSnapshot, idSeed: number): SignalProposal | undefined {
    if (this.recentMids.length < this.config.lookback) return undefined;

    const first = this.recentMids[0]!;
    const last = this.recentMids.at(-1)!;
    const momentum = (last - first) / first;
    if (momentum === 0) return undefined;

    const side: "buy" | "sell" = momentum > 0 ? "buy" : "sell";
    const entry = side === "buy" ? market.ask : market.bid;
    const stopDistance = this.volatilityAdjustedStopDistance(entry);
    const stopLoss = side === "buy" ? entry - stopDistance : entry + stopDistance;
    const takeProfit = side === "buy"
      ? entry + stopDistance * this.config.rewardToRisk
      : entry - stopDistance * this.config.rewardToRisk;
    const confidence = Math.min(0.95, 0.45 + Math.abs(momentum) * 4000);

    return {
      id: `signal-${market.symbol}-${idSeed}`,
      symbol: market.symbol,
      side,
      entry,
      stopLoss,
      takeProfit,
      confidence,
      rationale: [
        `Short-term momentum of ${(momentum * 10_000).toFixed(2)} bps over ${this.config.lookback} ticks`,
        `Volatility-adjusted stop distance of ${((stopDistance / entry) * 10_000).toFixed(2)} bps`,
      ],
    };
  }

  /** Realized volatility of recent mid-price returns, used as an ATR analog. */
  private volatilityAdjustedStopDistance(entry: number): number {
    const returns = this.recentMids.slice(1).map((value, index) => {
      const previous = this.recentMids[index]!;
      return (value - previous) / previous;
    });
    const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
    const variance = returns.length
      ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length
      : 0;
    const volatilityFraction = Math.sqrt(variance);

    const volatilityDistance = entry * volatilityFraction * this.config.volatilityMultiplier;
    const floorDistance = entry * (this.config.minStopDistanceBps / 10_000);
    return Math.max(volatilityDistance, floorDistance);
  }
}
