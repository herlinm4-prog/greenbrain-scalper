import type { OrderReceipt } from "./broker.js";
import type { AccountState, MarketSnapshot, RiskPolicy, SignalProposal, TradingMode } from "./domain.js";
import { ExecutionService } from "./execution-service.js";
import { TradingEngine, type EngineDecision } from "./trading-engine.js";
import { TradingJournal } from "./trading-journal.js";

export type AutomationMode = "assisted" | "automatic";

export interface ProcessSignalRequest {
  tradingMode: TradingMode;
  automationMode: AutomationMode;
  policy: RiskPolicy;
  account: AccountState;
  market: MarketSnapshot;
  proposal: SignalProposal;
  timestampMs: number;
}

export interface ProcessSignalResult {
  decision: EngineDecision;
  executionStatus: "not-approved" | "awaiting-confirmation" | "executed";
  receipt?: OrderReceipt;
}

export class GreenBrainCore {
  constructor(
    private readonly engine: TradingEngine,
    private readonly execution: ExecutionService,
    private readonly journal: TradingJournal,
  ) {}

  async processSignal(request: ProcessSignalRequest): Promise<ProcessSignalResult> {
    const decision = this.engine.evaluate(
      request.tradingMode,
      request.policy,
      request.account,
      request.market,
      request.proposal,
    );
    await this.journal.recordDecision(request.proposal, decision, request.timestampMs);

    if (decision.status !== "approved") {
      return { decision, executionStatus: "not-approved" };
    }
    if (request.automationMode === "assisted") {
      return { decision, executionStatus: "awaiting-confirmation" };
    }

    const receipt = await this.execution.execute(decision, request.proposal, request.timestampMs);
    return { decision, executionStatus: "executed", receipt };
  }

  async confirmAssisted(
    decision: EngineDecision,
    proposal: SignalProposal,
    timestampMs: number,
  ): Promise<OrderReceipt> {
    if (decision.status !== "approved") throw new Error("Only an approved assisted decision can be confirmed");
    return this.execution.execute(decision, proposal, timestampMs);
  }
}
