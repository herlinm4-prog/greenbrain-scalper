import type { UniversalOrder } from "./broker.js";
import type { Mt5AccountInfo, Mt5BridgeTransport, Mt5OrderCheckResult, Mt5OrderSendResult, Mt5Tick } from "./mt5-bridge.js";

export interface Mt5HttpTransportConfig {
  baseUrl: string;
  token: string;
  unitsPerLot?: number;
  requestTimeoutMs?: number;
}

type FetchLike = typeof fetch;

export class Mt5HttpTransport implements Mt5BridgeTransport {
  private readonly baseUrl: string;
  private readonly unitsPerLot: number;
  private readonly timeoutMs: number;

  constructor(private readonly config: Mt5HttpTransportConfig, private readonly fetcher: FetchLike = fetch) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.unitsPerLot = config.unitsPerLot ?? 100_000;
    this.timeoutMs = config.requestTimeoutMs ?? 3_000;
    if (!this.baseUrl.startsWith("https://") && !this.baseUrl.startsWith("http://127.0.0.1")) {
      throw new Error("MT5 bridge requires HTTPS outside localhost");
    }
  }

  async connect(): Promise<void> { await this.request("/v1/status"); }
  async disconnect(): Promise<void> {}
  async accountInfo(): Promise<Mt5AccountInfo> { return this.request("/v1/account"); }
  async heartbeat(): Promise<number> { return (await this.request<{ timestampMs:number }>("/v1/heartbeat")).timestampMs; }
  async symbolTick(symbol:string): Promise<Mt5Tick> { return this.request(`/v1/ticks/${encodeURIComponent(symbol)}`); }
  async orderCheck(order:UniversalOrder, magicNumber:number): Promise<Mt5OrderCheckResult> {
    return this.request("/v1/orders/check", "POST", this.payload(order, magicNumber));
  }
  async orderSend(order:UniversalOrder, magicNumber:number): Promise<Mt5OrderSendResult> {
    return this.request("/v1/orders/send", "POST", this.payload(order, magicNumber));
  }

  private payload(order:UniversalOrder, magicNumber:number) {
    return { ...order, volumeLots: order.units / this.unitsPerLot, magicNumber };
  }

  private async request<T>(path:string, method="GET", body?:unknown):Promise<T> {
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),this.timeoutMs);
    try {
      const response=await this.fetcher(`${this.baseUrl}${path}`,{method,headers:{Authorization:`Bearer ${this.config.token}`,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:controller.signal});
      const data=await response.json() as T & {detail?:string};
      if(!response.ok) throw new Error(`MT5 bridge ${response.status}: ${data.detail ?? "request failed"}`);
      return data;
    } finally { clearTimeout(timer); }
  }
}
