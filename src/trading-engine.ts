import type {
  AccountState,
  MarketSnapshot,
  RiskDecision,
  RiskPolicy,
  ShadowResult,
  ShadowScenario,
  SignalProposal,
  TradingMode,
} from "./domain.js";
import { RiskEngine } from "./risk-engine.js";
import { ShadowMarket } from "./shadow-market.js";

export interface EngineDecision {
  status: "approved" | "rejected";
  reason: string;
  risk: RiskDecision;
  shadowResults: ShadowResult[];
}

export interface EngineConfig {
  minimumConfidence: number;
  minimumSurvivalFraction: number;
  shadowScenarios: ShadowScenario[];
}

export class TradingEngine {
  constructor(
    private readonly config: EngineConfig,
    private readonly riskEngine = new RiskEngine(),
    private readonly shadowMarket = new ShadowMarket(),
  ) {}

  evaluate(
    mode: TradingMode,
    policy: RiskPolicy,
    account: AccountState,
    market: MarketSnapshot,
    proposal: SignalProposal,
  ): EngineDecision {
    if (proposal.symbol !== market.symbol) {
      return this.reject("Signal symbol does not match market snapshot");
    }

    if (proposal.confidence < this.config.minimumConfidence) {
      return this.reject("Signal confidence is below the operating threshold");
    }

    const risk = this.riskEngine.evaluate(mode, policy, account, market, proposal);
    if (!risk.approved) return { status: "rejected", reason: risk.reason, risk, shadowResults: [] };

    const shadowResults = this.shadowMarket.evaluate(proposal, this.config.shadowScenarios);
    const survivalFraction = shadowResults.length === 0
      ? 0
      : shadowResults.filter((result) => result.survives).length / shadowResults.length;

    if (survivalFraction < this.config.minimumSurvivalFraction) {
      return {
        status: "rejected",
        reason: "Signal failed the shadow-market survival threshold",
        risk,
        shadowResults,
      };
    }

    return {
      status: "approved",
      reason: "Signal passed confidence, risk, and shadow-market checks",
      risk,
      shadowResults,
    };
  }

  private reject(reason: string): EngineDecision {
    return {
      status: "rejected",
      reason,
      risk: { approved: false, reason, units: 0, riskAmount: 0 },
      shadowResults: [],
    };
  }
}
