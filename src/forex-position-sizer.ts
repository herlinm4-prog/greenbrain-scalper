export interface ForexInstrumentSpec {
  symbol: string;
  volumeMinLots: number;
  volumeMaxLots: number;
  volumeStepLots: number;
  tradeTickSize: number;
  tradeContractSize: number;
  accountCurrency: string;
}

export interface ForexSizingRequest {
  side: "buy" | "sell";
  entryPrice: number;
  stopLoss: number;
  equity: number;
  riskFraction: number;
  freeMargin: number;
  maximumMarginFraction: number;
}

export interface ForexSizingResult {
  approved: boolean;
  reason: string;
  volumeLots: number;
  targetRiskAmount: number;
  estimatedLossAtStop: number;
  estimatedMargin: number;
}

export interface Mt5CalculationPort {
  calculateProfit(
    side: "buy" | "sell",
    symbol: string,
    volumeLots: number,
    openPrice: number,
    closePrice: number,
  ): Promise<number | undefined>;
  calculateMargin(
    side: "buy" | "sell",
    symbol: string,
    volumeLots: number,
    openPrice: number,
  ): Promise<number | undefined>;
}

export class ForexPositionSizer {
  async size(
    spec: ForexInstrumentSpec,
    request: ForexSizingRequest,
    calculator: Mt5CalculationPort,
  ): Promise<ForexSizingResult> {
    const invalid = this.validate(spec, request);
    if (invalid) return this.reject(invalid);

    const oneLotProfit = await calculator.calculateProfit(
      request.side,
      spec.symbol,
      1,
      request.entryPrice,
      request.stopLoss,
    );
    if (oneLotProfit === undefined || !Number.isFinite(oneLotProfit)) {
      return this.reject("MT5 could not calculate stop-loss value in account currency");
    }
    const oneLotLoss = Math.abs(oneLotProfit);
    if (oneLotLoss <= 0) return this.reject("Calculated one-lot stop loss must be negative and non-zero");

    const targetRiskAmount = request.equity * request.riskFraction;
    const rawLots = targetRiskAmount / oneLotLoss;
    const volumeLots = Math.min(
      spec.volumeMaxLots,
      this.floorToStep(rawLots, spec.volumeStepLots),
    );
    if (volumeLots + Number.EPSILON < spec.volumeMinLots) {
      return this.reject("Risk budget is below the broker minimum volume", targetRiskAmount);
    }

    const [sizedProfit, estimatedMargin] = await Promise.all([
      calculator.calculateProfit(request.side, spec.symbol, volumeLots, request.entryPrice, request.stopLoss),
      calculator.calculateMargin(request.side, spec.symbol, volumeLots, request.entryPrice),
    ]);
    if (sizedProfit === undefined || estimatedMargin === undefined || !Number.isFinite(sizedProfit) || !Number.isFinite(estimatedMargin)) {
      return this.reject("MT5 sizing verification failed", targetRiskAmount);
    }
    const estimatedLossAtStop = Math.abs(sizedProfit);
    if (estimatedLossAtStop > targetRiskAmount + 0.01) {
      return this.reject("Rounded broker volume exceeds the risk budget", targetRiskAmount);
    }
    const allowedMargin = request.freeMargin * request.maximumMarginFraction;
    if (estimatedMargin > allowedMargin) {
      return this.reject("Estimated margin exceeds the configured free-margin limit", targetRiskAmount, estimatedLossAtStop, estimatedMargin);
    }

    return {
      approved: true,
      reason: "Sized with MT5 account-currency profit and margin calculations",
      volumeLots,
      targetRiskAmount,
      estimatedLossAtStop,
      estimatedMargin,
    };
  }

  private validate(spec: ForexInstrumentSpec, request: ForexSizingRequest): string | undefined {
    if (request.equity <= 0 || request.freeMargin < 0) return "Equity and free margin must be valid";
    if (request.riskFraction <= 0 || request.riskFraction > 1) return "Risk fraction must be between zero and one";
    if (request.maximumMarginFraction <= 0 || request.maximumMarginFraction > 1) return "Maximum margin fraction must be between zero and one";
    if (spec.volumeMinLots <= 0 || spec.volumeMaxLots < spec.volumeMinLots || spec.volumeStepLots <= 0) return "Broker volume specification is invalid";
    if (spec.tradeTickSize <= 0 || spec.tradeContractSize <= 0) return "Broker tick or contract specification is invalid";
    if (request.entryPrice <= 0 || request.stopLoss <= 0) return "Entry and stop prices must be positive";
    if (request.side === "buy" && request.stopLoss >= request.entryPrice) return "Buy stop loss must be below entry";
    if (request.side === "sell" && request.stopLoss <= request.entryPrice) return "Sell stop loss must be above entry";
    return undefined;
  }

  private floorToStep(value: number, step: number): number {
    const steps = Math.floor((value + Number.EPSILON) / step);
    return Number((steps * step).toFixed(8));
  }

  private reject(
    reason: string,
    targetRiskAmount = 0,
    estimatedLossAtStop = 0,
    estimatedMargin = 0,
  ): ForexSizingResult {
    return { approved: false, reason, volumeLots: 0, targetRiskAmount, estimatedLossAtStop, estimatedMargin };
  }
}
