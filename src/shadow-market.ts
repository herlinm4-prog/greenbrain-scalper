import type { ShadowResult, ShadowScenario, SignalProposal } from "./domain.js";

const applyBps = (price: number, basisPoints: number): number =>
  price * (1 + basisPoints / 10_000);

export class ShadowMarket {
  evaluate(proposal: SignalProposal, scenarios: ShadowScenario[]): ShadowResult[] {
    return scenarios.map((scenario) => {
      const adverseBps = scenario.extraSpreadBps + scenario.slippageBps;
      const signedBps = proposal.side === "buy" ? adverseBps : -adverseBps;
      const stressedEntry = applyBps(proposal.entry, signedBps);
      const risk = Math.abs(stressedEntry - proposal.stopLoss);
      const reward = Math.abs(proposal.takeProfit - stressedEntry);
      const rewardToRisk = risk === 0 ? 0 : reward / risk;

      return {
        scenario: scenario.name,
        entry: stressedEntry,
        rewardToRisk,
        survives: rewardToRisk >= 1,
      };
    });
  }
}
