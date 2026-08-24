import type { MarketSnapshot } from "./domain.js";

export interface SimulatorConfig {
  symbol: string;
  broker: string;
  initialMid: number;
  spreadBps: number;
  volatilityBps: number;
  seed: number;
}

export class ForexDemoFeed {
  private mid: number;
  private state: number;

  constructor(private readonly config: SimulatorConfig) {
    this.mid = config.initialMid;
    this.state = config.seed >>> 0;
  }

  next(timestampMs: number): MarketSnapshot {
    const shock = (this.random() - 0.5) * 2 * this.config.volatilityBps;
    this.mid *= 1 + shock / 10_000;
    const halfSpread = (this.mid * this.config.spreadBps) / 20_000;

    return {
      symbol: this.config.symbol,
      bid: this.mid - halfSpread,
      ask: this.mid + halfSpread,
      timestampMs,
      broker: this.config.broker,
    };
  }

  private random(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x1_0000_0000;
  }
}
