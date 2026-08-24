import { describe,expect,it } from "vitest";
import { ExperienceLoop } from "../src/experience-loop.js";

describe("ExperienceLoop",()=>{
  it("learns from net profit after every execution cost",()=>{
    const loop=new ExperienceLoop();
    const x=loop.recordExecution({id:"x1",opportunityId:"o1",strategyId:"s1",symbol:"EURUSD",regime:"trend",side:"buy",entryPrice:1.1,exitPrice:1.101,units:10_000,initialRiskAmount:5,spreadCost:1,commission:.5,slippageCost:.5,maximumFavorablePnl:12,maximumAdversePnl:-3,openedAtMs:1,closedAtMs:2,outOfSample:true});
    expect(x.grossPnl).toBeCloseTo(10); expect(x.netPnl).toBeCloseTo(8); expect(x.netReturnR).toBeCloseTo(1.6); expect(x.captureEfficiency).toBeCloseTo(2/3);
  });
  it("distinguishes protected capital from missed opportunity",()=>{
    const loop=new ExperienceLoop();
    expect(loop.recordRejection({id:"r1",opportunityId:"o1",strategyId:"s1",symbol:"EURUSD",regime:"range",rejectedAtMs:1,reason:"spread",counterfactualReturnR:-.7,outOfSample:true}).assessment).toBe("protected-capital");
    expect(loop.recordRejection({id:"r2",opportunityId:"o2",strategyId:"s1",symbol:"EURUSD",regime:"range",rejectedAtMs:2,reason:"confidence",counterfactualReturnR:1.1,outOfSample:true}).assessment).toBe("missed-opportunity");
  });
  it("feeds only executed net outcomes into edge attribution",()=>{
    const loop=new ExperienceLoop();
    loop.recordExecution({id:"x1",opportunityId:"o1",strategyId:"s1",symbol:"EURUSD",regime:"trend",side:"sell",entryPrice:1.1,exitPrice:1.099,units:10_000,initialRiskAmount:5,spreadCost:1,commission:0,slippageCost:0,maximumFavorablePnl:11,maximumAdversePnl:-2,openedAtMs:1,closedAtMs:2,outOfSample:false});
    loop.recordRejection({id:"r1",opportunityId:"o2",strategyId:"s1",symbol:"EURUSD",regime:"trend",rejectedAtMs:3,reason:"risk",outOfSample:false});
    expect(loop.attributionOutcomes("s1")).toHaveLength(1); expect(loop.summary("s1").rejected).toBe(1);
  });
});
