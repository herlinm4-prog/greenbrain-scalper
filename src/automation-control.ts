export type AssistedExecutionSource = "internal" | "mt5";
export type AssistedExecutionSide = "buy" | "sell";

export interface PendingAssistedDecision {
  id: string;
  source: AssistedExecutionSource;
  side: AssistedExecutionSide;
  confidencePct: number;
  reason: string;
  riskAmount: number;
  createdAtMs: number;
  expiresAtMs: number;
}

export interface ArmedAssistedApproval {
  source: AssistedExecutionSource;
  side: AssistedExecutionSide;
  expiresAtMs: number;
}

export interface AssistedExecutionState {
  pending: PendingAssistedDecision | undefined;
  armed: ArmedAssistedApproval | undefined;
}

/**
 * Keeps assisted-mode confirmation state outside the trading engine.
 * A confirmation never replays a stale order. It only arms one fresh,
 * matching BUY/SELL decision for a short window. The next qualifying
 * decision still passes the normal market, historical and risk checks.
 */
export class AssistedExecutionControl {
  private pending: PendingAssistedDecision | undefined;
  private armed: ArmedAssistedApproval | undefined;

  constructor(private readonly ttlMs = 15_000) {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("Assisted confirmation TTL must be positive");
    }
  }

  present(
    input: Omit<PendingAssistedDecision, "createdAtMs" | "expiresAtMs">,
    nowMs: number,
  ): PendingAssistedDecision {
    this.purge(nowMs);
    const pending: PendingAssistedDecision = {
      ...input,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + this.ttlMs,
    };
    this.pending = pending;
    return { ...pending };
  }

  confirm(nowMs: number): ArmedAssistedApproval {
    this.purge(nowMs);
    if (!this.pending) throw new Error("No pending assisted decision to confirm");
    this.armed = {
      source: this.pending.source,
      side: this.pending.side,
      expiresAtMs: nowMs + this.ttlMs,
    };
    this.pending = undefined;
    return { ...this.armed };
  }

  discard(): void {
    this.pending = undefined;
    this.armed = undefined;
  }

  clear(): void {
    this.discard();
  }

  consumeIfApproved(source: AssistedExecutionSource, side: AssistedExecutionSide, nowMs: number): boolean {
    this.purge(nowMs);
    if (!this.armed || this.armed.source !== source || this.armed.side !== side) return false;
    this.armed = undefined;
    return true;
  }

  state(nowMs: number): AssistedExecutionState {
    this.purge(nowMs);
    return {
      pending: this.pending ? { ...this.pending } : undefined,
      armed: this.armed ? { ...this.armed } : undefined,
    };
  }

  private purge(nowMs: number): void {
    if (this.pending && this.pending.expiresAtMs <= nowMs) this.pending = undefined;
    if (this.armed && this.armed.expiresAtMs <= nowMs) this.armed = undefined;
  }
}
