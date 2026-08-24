import { describe, expect, it } from "vitest";
import { ForexPositionSizer, type ForexInstrumentSpec, type Mt5CalculationPort } from "../src/forex-position-sizer.js";

class FakeMt5Calculator implements Mt5CalculationPort {
  constructor(private readonly lossPerLot: Record<string, number>) {}
  async calculateProfit(_side: "buy" | "sell", symbol: string, volumeLots: number) {
    const loss = this.lossPerLot[symbol];
    return loss === undefined ? undefined : -loss * volumeLots;
  }
  async calculateMargin(_side: "buy" | "sell", _symbol: string, volumeLots: number) {
    return 1_000 * volumeLots;
  }
}

const spec = (symbol: string): ForexInstrumentSpec => ({
  symbol,
  volumeMinLots: 0.01,
  volumeMaxLots: 100,
  volumeStepLots: 0.01,
  tradeTickSize: symbol.endsWith("JPY") ? 0.001 : 0.00001,
  tradeContractSize: 100_000,
  accountCurrency: "USD",
});

const calculator = new FakeMt5Calculator({ EURUSD: 500, USDJPY: 460, GBPUSD: 620 });

describe("ForexPositionSizer", () => {
  it.each([
    ["EURUSD", 0.2, 100],
    ["USDJPY", 0.21, 96.6],
    ["GBPUSD", 0.16, 99.2],
  ])("sizes %s in broker lots using account-currency loss", async (symbol, expectedLots, expectedLoss) => {
    const result = await new ForexPositionSizer().size(spec(symbol), {
      side: "buy",
      entryPrice: symbol.endsWith("JPY") ? 150 : 1.25,
      stopLoss: symbol.endsWith("JPY") ? 149.5 : 1.245,
      equity: 10_000,
      riskFraction: 0.01,
      freeMargin: 8_000,
      maximumMarginFraction: 0.5,
    }, calculator);

    expect(result.approved).toBe(true);
    expect(result.volumeLots).toBe(expectedLots);
    expect(result.estimatedLossAtStop).toBeCloseTo(expectedLoss);
  });

  it("rejects volume below the broker minimum instead of rounding risk upward", async () => {
    const result = await new ForexPositionSizer().size(spec("EURUSD"), {
      side: "buy",
      entryPrice: 1.25,
      stopLoss: 1.245,
      equity: 100,
      riskFraction: 0.001,
      freeMargin: 100,
      maximumMarginFraction: 0.5,
    }, calculator);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("minimum volume");
  });

  it("rejects an order whose margin exceeds the configured free-margin limit", async () => {
    const result = await new ForexPositionSizer().size(spec("EURUSD"), {
      side: "buy",
      entryPrice: 1.25,
      stopLoss: 1.245,
      equity: 100_000,
      riskFraction: 0.01,
      freeMargin: 500,
      maximumMarginFraction: 0.1,
    }, calculator);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("margin");
  });

  it("rejects a stop on the wrong side of entry", async () => {
    const result = await new ForexPositionSizer().size(spec("EURUSD"), {
      side: "buy",
      entryPrice: 1.25,
      stopLoss: 1.26,
      equity: 10_000,
      riskFraction: 0.01,
      freeMargin: 8_000,
      maximumMarginFraction: 0.5,
    }, calculator);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("below entry");
  });
});
