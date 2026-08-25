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
import type { HistoricalContext } from "./market-intelligence.js";
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
    historicalContext?: HistoricalContext,
  ): EngineDecision {
    if (proposal.symbol !== market.symbol) {
      return this.reject("Signal symbol does not match market snapshot");
    }

    if (proposal.confidence < this.config.minimumConfidence) {
      return this.reject("Signal confidence is below the operating threshold");
    }

    if (historicalContext) {
      if (historicalContext.posture === "avoid") {
        return this.reject("Historical market context says to avoid new exposure");
      }
      if (historicalContext.posture === "favor-long" && proposal.side === "sell") {
        return this.reject("Sell signal conflicts with the current historical trend context");
      }
      if (historicalContext.posture === "favor-short" && proposal.side === "buy") {
        return this.reject("Buy signal conflicts with the current historical trend context");
      }
      if (historicalContext.confidence < 0.35) {
        return this.reject("Historical context is too uncertain to support execution");
      }
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
      reason: historicalContext
        ? "Signal passed confidence, historical context, risk, and shadow-market checks"
        : "Signal passed confidence, risk, and shadow-market checks",
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
