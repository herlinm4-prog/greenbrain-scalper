import type { StrategyTradeOutcome } from "./strategy-attribution.js";

export interface ExecutedExperienceInput {
  id:string; opportunityId:string; strategyId:string; symbol:string; regime:string;
  side:"buy"|"sell"; entryPrice:number; exitPrice:number; units:number;
  initialRiskAmount:number; spreadCost:number; commission:number; slippageCost:number;
  maximumFavorablePnl:number; maximumAdversePnl:number; openedAtMs:number; closedAtMs:number;
  outOfSample:boolean;
}
export interface RejectedExperienceInput {
  id:string; opportunityId:string; strategyId:string; symbol:string; regime:string;
  rejectedAtMs:number; reason:string; counterfactualReturnR?:number; outOfSample:boolean;
}
export interface ExecutedExperience extends ExecutedExperienceInput {
  kind:"executed"; grossPnl:number; totalCosts:number; netPnl:number; netReturnR:number;
  costDragR:number; captureEfficiency:number; outcome:"profit"|"loss"|"breakeven";
}
export interface RejectedExperience extends RejectedExperienceInput {
  kind:"rejected"; assessment:"protected-capital"|"missed-opportunity"|"unresolved";
}
export type OpportunityExperience=ExecutedExperience|RejectedExperience;

export interface StrategyEfficiencySummary {
  strategyId:string; executed:number; rejected:number; protectedCapitalEvents:number; missedOpportunities:number;
  netPnl:number; expectancyR:number; winRate:number; profitFactor:number; averageCostDragR:number;
  averageCaptureEfficiency:number;
}

export class ExperienceLoop {
  private readonly records=new Map<string,OpportunityExperience>();

  recordExecution(input:ExecutedExperienceInput):ExecutedExperience {
    this.assertUnique(input.id);
    if(input.units<=0||input.entryPrice<=0||input.exitPrice<=0||input.initialRiskAmount<=0) throw new Error("Execution experience requires positive prices, units, and initial risk");
    if(input.closedAtMs<input.openedAtMs) throw new Error("Close time cannot precede open time");
    const direction=input.side==="buy"?1:-1;
    const grossPnl=direction*(input.exitPrice-input.entryPrice)*input.units;
    const totalCosts=input.spreadCost+input.commission+input.slippageCost;
    if(totalCosts<0) throw new Error("Trading costs cannot be negative");
    const netPnl=grossPnl-totalCosts;
    const netReturnR=netPnl/input.initialRiskAmount;
    const favorable=Math.max(0,input.maximumFavorablePnl);
    const captureEfficiency=favorable===0?0:Math.max(-1,Math.min(1,netPnl/favorable));
    const record:ExecutedExperience={...input,kind:"executed",grossPnl,totalCosts,netPnl,netReturnR,costDragR:totalCosts/input.initialRiskAmount,captureEfficiency,outcome:netPnl>0?"profit":netPnl<0?"loss":"breakeven"};
    this.records.set(record.id,structuredClone(record)); return structuredClone(record);
  }

  recordRejection(input:RejectedExperienceInput):RejectedExperience {
    this.assertUnique(input.id);
    const value=input.counterfactualReturnR;
    const assessment=value===undefined?"unresolved":value<0?"protected-capital":value>0?"missed-opportunity":"unresolved";
    const record:RejectedExperience={...input,kind:"rejected",assessment};
    this.records.set(record.id,structuredClone(record)); return structuredClone(record);
  }

  attributionOutcomes(strategyId:string):StrategyTradeOutcome[] {
    return [...this.records.values()].filter((x):x is ExecutedExperience=>x.kind==="executed"&&x.strategyId===strategyId).map(x=>({id:x.id,strategyId:x.strategyId,timestampMs:x.closedAtMs,netReturnR:x.netReturnR,regime:x.regime,outOfSample:x.outOfSample}));
  }

  summary(strategyId:string):StrategyEfficiencySummary {
    const all=[...this.records.values()].filter(x=>x.strategyId===strategyId);
    const trades=all.filter((x):x is ExecutedExperience=>x.kind==="executed");
    const rejected=all.filter((x):x is RejectedExperience=>x.kind==="rejected");
    const wins=trades.filter(x=>x.netPnl>0); const gains=wins.reduce((s,x)=>s+x.netPnl,0);
    const losses=Math.abs(trades.filter(x=>x.netPnl<0).reduce((s,x)=>s+x.netPnl,0));
    const mean=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:0;
    return {strategyId,executed:trades.length,rejected:rejected.length,protectedCapitalEvents:rejected.filter(x=>x.assessment==="protected-capital").length,missedOpportunities:rejected.filter(x=>x.assessment==="missed-opportunity").length,netPnl:trades.reduce((s,x)=>s+x.netPnl,0),expectancyR:mean(trades.map(x=>x.netReturnR)),winRate:trades.length?wins.length/trades.length:0,profitFactor:losses===0?(gains>0?Number.POSITIVE_INFINITY:0):gains/losses,averageCostDragR:mean(trades.map(x=>x.costDragR)),averageCaptureEfficiency:mean(trades.map(x=>x.captureEfficiency))};
  }
  all():OpportunityExperience[]{return structuredClone([...this.records.values()])}
  private assertUnique(id:string){if(this.records.has(id))throw new Error(`Experience already recorded: ${id}`)}
}
