export type FeedHealth = "healthy" | "stale" | "offline";

export interface FeedHealthReport {
  status: FeedHealth;
  ageMs: number;
  canTrade: boolean;
  reason: string;
}

export class MarketWatchdog {
  constructor(
    private readonly staleAfterMs = 15_000,
    private readonly offlineAfterMs = 60_000,
  ) {
    if (staleAfterMs <= 0 || offlineAfterMs <= staleAfterMs) {
      throw new Error("Watchdog thresholds must be positive and offline must exceed stale");
    }
  }

  evaluate(lastMarketTimestampMs: number | undefined, nowMs: number): FeedHealthReport {
    if (lastMarketTimestampMs === undefined) {
      return { status: "offline", ageMs: Number.POSITIVE_INFINITY, canTrade: false, reason: "No market data has been received" };
    }
    const ageMs = Math.max(0, nowMs - lastMarketTimestampMs);
    if (ageMs >= this.offlineAfterMs) {
      return { status: "offline", ageMs, canTrade: false, reason: "Market feed is offline; automated execution must remain stopped" };
    }
    if (ageMs >= this.staleAfterMs) {
      return { status: "stale", ageMs, canTrade: false, reason: "Market feed is stale; GreenBrain is monitoring but will not open new trades" };
    }
    return { status: "healthy", ageMs, canTrade: true, reason: "Market feed is fresh" };
  }
}
