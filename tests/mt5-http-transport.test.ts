import { describe, expect, it } from "vitest";
import { Mt5HttpTransport } from "../src/mt5-http-transport.js";
import type { UniversalOrder } from "../src/broker.js";

const order:UniversalOrder={id:"order-1",signalId:"signal-1",symbol:"EURUSD",side:"buy",units:10_000,requestedPrice:1.1,stopLoss:1.099,takeProfit:1.102,createdAtMs:1_000};

describe("Mt5HttpTransport",()=>{
  it("requires encrypted transport outside localhost",()=>{
    expect(()=>new Mt5HttpTransport({baseUrl:"http://bridge.example",token:"secret"})).toThrow("HTTPS");
  });
  it("authenticates and converts universal units to broker lots",async()=>{
    let captured:any;
    const fake=async(_url:any,init:any)=>{captured=init;return new Response(JSON.stringify({accepted:true,reason:"ok"}),{status:200,headers:{"Content-Type":"application/json"}})};
    const transport=new Mt5HttpTransport({baseUrl:"https://bridge.example",token:"bridge-secret"},fake as typeof fetch);
    await transport.orderCheck(order,260824);
    expect(captured.headers.Authorization).toBe("Bearer bridge-secret");
    expect(JSON.parse(captured.body).volumeLots).toBe(0.1);
  });
  it("fails closed on bridge rejection",async()=>{
    const fake=async()=>new Response(JSON.stringify({detail:"Non-demo MT5 account blocked"}),{status:403,headers:{"Content-Type":"application/json"}});
    const transport=new Mt5HttpTransport({baseUrl:"https://bridge.example",token:"secret"},fake as typeof fetch);
    await expect(transport.connect()).rejects.toThrow("Non-demo");
  });
});
