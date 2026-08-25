import type { MarketSnapshot, SignalProposal } from "./domain.js";

export interface SignalGeneratorConfig {
  symbol: string;
  lookback: number;
  stopDistanceBps: number;
  rewardToRisk: number;
}

/**
 * Demo-only momentum signal generator. This is intentionally simple and
 * transparent: it exists to exercise the full decision pipeline (confidence,
 * historical-context gate, risk, shadow-market) end to end while the
 * project's richer strategy library / pattern discovery are wired in later.
 */
export class MomentumSignalGenerator {
  private readonly recentMids: number[] = [];

  constructor(private readonly config: SignalGeneratorConfig) {
    if (config.lookback < 3) throw new Error("Lookback must be at least 3 ticks");
    if (config.stopDistanceBps <= 0) throw new Error("Stop distance must be positive");
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
    const stopDistance = entry * (this.config.stopDistanceBps / 10_000);
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
      rationale: [`Short-term momentum of ${(momentum * 10_000).toFixed(2)} bps over ${this.config.lookback} ticks`],
    };
  }
}
