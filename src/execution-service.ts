import type { BrokerAdapter, UniversalOrder } from "./broker.js";
import type { EngineDecision } from "./trading-engine.js";
import type { SignalProposal } from "./domain.js";
import { ExecutionLedger } from "./execution-ledger.js";

export class ExecutionService {
  constructor(
    private readonly broker: BrokerAdapter,
    private readonly ledger: ExecutionLedger,
  ) {}

  async execute(
    decision: EngineDecision,
    proposal: SignalProposal,
    timestampMs: number,
  ) {
    if (this.broker.environment !== "demo") {
      throw new Error("Live broker execution is disabled in this development build");
    }
    if (decision.status !== "approved" || !decision.risk.approved) {
      throw new Error(`Cannot execute rejected decision: ${decision.reason}`);
    }

    const order: UniversalOrder = {
      id: `order-${proposal.id}`,
      signalId: proposal.id,
      symbol: proposal.symbol,
      side: proposal.side,
      units: decision.risk.units,
      requestedPrice: proposal.entry,
      stopLoss: proposal.stopLoss,
      takeProfit: proposal.takeProfit,
      createdAtMs: timestampMs,
    };

    this.ledger.register(order);
    const receipt = await this.broker.submit(order);
    this.ledger.record(receipt);
    return receipt;
  }
}
