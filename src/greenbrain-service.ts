import { GreenBrainCore } from "./greenbrain-core.js";
import { TradingEngine } from "./trading-engine.js";
import { ExecutionService } from "./execution-service.js";
import { ExecutionLedger } from "./execution-ledger.js";
import { PositionLedger, type Position } from "./position-ledger.js";
import { PaperBroker } from "./paper-broker.js";
import { ForexDemoFeed } from "./simulator.js";
import type { BrokerAdapter } from "./broker.js";
import { InMemoryJournalStore, TradingJournal } from "./trading-journal.js";
import { MarketWatchdog, type FeedHealthReport } from "./market-watchdog.js";
import { MarketIntelligence, type HistoricalBar, type HistoricalContext } from "./market-intelligence.js";
import { SessionProtection, type SessionProtectionState } from "./session-protection.js";
import { RiskAdvisor, type RiskAdvice } from "./risk-advisor.js";
import { ExperienceLoop } from "./experience-loop.js";
import { GreenBrainKnowledgeBase, type KnowledgeItem, type KnowledgeSource, type KnowledgeBrief } from "./knowledge-base.js";
import { MomentumSignalGenerator } from "./signal-generator.js";
import { riskPolicyFor, engineConfigFor } from "./style-policy.js";
import type {
  Mt5PushAllowlist,
  Mt5PushCloseReport,
  Mt5PushDecision,
  Mt5PushFillReport,
  Mt5PushSnapshot,
} from "./mt5-push.js";
import {
  SettingsStore,
  type GreenBrainSettings,
  type SettingsPersistence,
} from "./settings-store.js";
import type { AccountState, MarketSnapshot } from "./domain.js";
import type { GreenBrainDecisionLabel, GreenBrainTelemetry, TelemetryHistoryRow } from "./telemetry.js";

const SYMBOL = "EURUSD";
const STARTING_EQUITY = 10_000;
const TICKS_PER_BAR = 5;
const MAX_BARS = 60;
const MAX_HISTORY_ROWS = 20;
const MAX_LOG_LINES = 30;
const MAX_RECENT_RESULTS = 20;
/**
 * Standard forex contract size. Correct for EURUSD with a USD account
 * currency, which is what this codebase hardcodes today - documented here
 * because it's the one simplification that would need revisiting before
 * supporting other symbols or account currencies.
 */
const UNITS_PER_LOT = 100_000;

export interface GreenBrainServiceConfig {
  settingsPersistence?: SettingsPersistence;
  seed?: number;
  /**
   * Optional real broker adapter (e.g. Mt5DemoAdapter wired to the Python
   * bridge). When omitted, GreenBrainService falls back to its own
   * paper/demo feed - this keeps every default path fully isolated from
   * any live MT5 connection.
   */
  broker?: BrokerAdapter;
  /**
   * Enables the MQL5 "push" integration (evaluateExternalTick / reportFill /
   * reportClose): an Expert Advisor running inside a real MT5 terminal
   * pushes ticks and account state over HTTP instead of GreenBrain pulling
   * from a Python bridge. When set, only requests whose accountLogin and
   * accountServer match exactly are accepted - everything else is rejected,
   * mirroring the same allowlist Mt5DemoAdapter already enforces.
   */
  mt5PushAllowlist?: Mt5PushAllowlist;
}

export class GreenBrainService {
  private readonly broker: BrokerAdapter;
  private readonly usingInjectedBroker: boolean;
  private readonly journalStore = new InMemoryJournalStore();
  private readonly journal: TradingJournal;
  private readonly positionLedger = new PositionLedger();
  private readonly executionLedger = new ExecutionLedger();
  private readonly execution: ExecutionService;
  private readonly watchdog = new MarketWatchdog();
  private readonly marketIntelligence = new MarketIntelligence();
  private readonly riskAdvisor = new RiskAdvisor();
  private readonly experience = new ExperienceLoop();
  private readonly knowledgeBase = new GreenBrainKnowledgeBase();
  private readonly signalGenerator: MomentumSignalGenerator;
  private readonly strategyId = "momentum-v1";

  private settingsStore!: SettingsStore;
  private engine!: TradingEngine;
  private sessionProtection!: SessionProtection;

  private tickCount = 0;
  private halted = false;
  private lastMarket: MarketSnapshot | undefined;
  private bars: HistoricalBar[] = [];
  private barBuffer: MarketSnapshot[] = [];
  private historicalContext: HistoricalContext | undefined;
  private lastSessionProtection: SessionProtectionState = {
    peakDailyPnl: 0,
    pauseNewTrades: false,
    reason: "Session protection is warming up",
  };
  private account: AccountState = { equity: STARTING_EQUITY, dailyPnl: 0, openPositions: 0 };
  private wins = 0;
  private losses = 0;
  private recentResults: number[] = [];
  private history: TelemetryHistoryRow[] = [];
  private log: string[] = [];
  private lastDecision: GreenBrainDecisionLabel = "WAIT";
  private lastConfidencePct = 0;
  private lastReason = "GreenBrain is building market memory.";

  private readonly mt5PushAllowlist: Mt5PushAllowlist | undefined;
  private mt5PushDecisionCount = 0;
  private readonly openMt5PositionsByTicket = new Map<
    number,
    { symbol: string; side: "buy" | "sell"; entryPrice: number; stopLoss: number; takeProfit: number; volumeLots: number; openedAtMs: number }
  >();

  private constructor(config: GreenBrainServiceConfig) {
    this.mt5PushAllowlist = config.mt5PushAllowlist;
    this.usingInjectedBroker = config.broker !== undefined;
    this.broker = config.broker ?? new PaperBroker({
      id: "greenbrain-paper",
      slippageBps: 0.3,
      feed: new ForexDemoFeed({
        symbol: SYMBOL,
        broker: "greenbrain-paper",
        initialMid: 1.1,
        spreadBps: 0.8,
        volatilityBps: 1.4,
        seed: config.seed ?? 91,
      }),
    });
    this.journal = new TradingJournal(this.journalStore);
    this.execution = new ExecutionService(this.broker, this.executionLedger, this.positionLedger, this.journal);
    this.signalGenerator = new MomentumSignalGenerator({
      symbol: SYMBOL,
      lookback: 6,
      volatilityMultiplier: 2.2,
      minStopDistanceBps: 4,
      rewardToRisk: 1.6,
    });
    this.seedKnowledgeBase();
  }

  static async create(config: GreenBrainServiceConfig = {}): Promise<GreenBrainService> {
    const service = new GreenBrainService(config);
    service.settingsStore = await SettingsStore.create(config.settingsPersistence);
    service.applySettings(service.settingsStore.get());
    service.appendLog(
      service.usingInjectedBroker
        ? `Connected to live broker adapter: ${service.broker.id}`
        : "Running on the built-in paper/demo simulator (no MT5 connection configured)",
    );
    if (service.mt5PushAllowlist) {
      service.appendLog(
        `MT5 push mode enabled - waiting for the Expert Advisor to report account ${service.mt5PushAllowlist.login}@${service.mt5PushAllowlist.server}`,
      );
    }
    return service;
  }

  getSettings(): GreenBrainSettings {
    return this.settingsStore.get();
  }

  async updateSettings(rawPatch: unknown): Promise<GreenBrainSettings> {
    const previous = this.settingsStore.get();
    const next = await this.settingsStore.update(rawPatch);
    this.applySettings(next);
    this.appendLog(describeSettingsChange(previous, next));
    return next;
  }

  emergencyStop(): void {
    this.halted = true;
    this.lastDecision = "HALTED";
    this.lastReason = "Emergency stop engaged. No new automated decisions will be made.";
    this.appendLog("EMERGENCY STOP ENGAGED");
  }

  /**
   * MQL5 push-mode entry point. An Expert Advisor running inside a real MT5
   * terminal calls this on every evaluation tick instead of GreenBrain
   * pulling data through a Python bridge. Runs the exact same intelligence
   * pipeline as tick() (bars -> MarketIntelligence -> signal generator ->
   * TradingEngine/RiskEngine -> SessionProtection) but never places an
   * order itself: it returns a decision for the EA to execute locally with
   * MT5's own lot sizing, and updates telemetry from the account state the
   * EA reports (so equity/dailyPnl reflect the real account, not a
   * synthetic balance).
   */
  async evaluateExternalTick(input: Mt5PushSnapshot): Promise<Mt5PushDecision> {
    this.assertPushModeEnabled();
    this.assertAllowlisted(input.accountLogin, input.accountServer);
    if (input.accountTradeMode !== "demo") {
      throw new Error("Non-demo MT5 account rejected");
    }
    if (input.symbol !== SYMBOL) {
      throw new Error(`Unsupported symbol: ${input.symbol} (GreenBrain currently only trades ${SYMBOL})`);
    }
    if (input.bid <= 0 || input.ask <= input.bid) {
      throw new Error("Invalid bid/ask from MT5");
    }

    const settings = this.settingsStore.get();
    const decisionId = `mt5-push-${++this.mt5PushDecisionCount}-${input.timestampMs}`;
    const nowMs = input.timestampMs;
    const snapshot: MarketSnapshot = {
      symbol: input.symbol,
      bid: input.bid,
      ask: input.ask,
      timestampMs: input.timestampMs,
      broker: "mt5-live",
    };

    this.lastMarket = snapshot;
    this.account = { equity: input.equity, dailyPnl: this.account.dailyPnl, openPositions: input.openPositions };
    this.tickCount += 1;

    if (this.halted || !settings.automationRunning) {
      return this.pushWait(decisionId, this.halted ? "Emergency stop is engaged" : "Automation is paused");
    }

    const feedHealth = this.watchdog.evaluate(input.timestampMs, nowMs);
    this.accumulateBar(snapshot);
    this.signalGenerator.observe(snapshot);
    if (this.bars.length >= 8) {
      this.historicalContext = this.marketIntelligence.analyze(this.bars);
    }
    this.lastSessionProtection = this.sessionProtection.evaluate(this.account.dailyPnl);

    if (!feedHealth.canTrade) return this.pushWait(decisionId, feedHealth.reason);

    const proposal = this.signalGenerator.propose(snapshot, this.tickCount);
    if (!proposal) {
      return this.pushWait(
        decisionId,
        this.historicalContext
          ? this.marketIntelligence.explain(this.historicalContext)
          : "Building short-term momentum context before proposing a trade.",
      );
    }
    this.lastConfidencePct = Math.round(proposal.confidence * 100);

    if (input.openPositions >= 1) {
      return this.pushWait(decisionId, "GreenBrain is managing an open position and will not stack new exposure.");
    }
    if (this.lastSessionProtection.pauseNewTrades) {
      return this.pushWait(decisionId, this.lastSessionProtection.reason);
    }

    const policy = riskPolicyFor(settings);
    const decision = this.engine.evaluate(
      "demo",
      policy,
      this.account,
      snapshot,
      proposal,
      this.historicalContext,
    );
    void this.journal.recordDecision(proposal, decision, nowMs);

    if (decision.status !== "approved") {
      this.experience.recordRejection({
        id: `reject-${proposal.id}`,
        opportunityId: proposal.id,
        strategyId: this.strategyId,
        symbol: proposal.symbol,
        regime: this.historicalContext?.trend ?? "unknown",
        rejectedAtMs: nowMs,
        reason: decision.reason,
        outOfSample: false,
      });
      return this.pushWait(decisionId, decision.reason);
    }

    this.lastDecision = proposal.side === "buy" ? "BUY" : "SELL";
    this.lastReason = decision.reason;
    this.appendLog(
      `${this.lastDecision} approved for MT5 - confidence ${this.lastConfidencePct}% - risk $${decision.risk.riskAmount.toFixed(2)} (decision ${decisionId})`,
    );

    return {
      decisionId,
      action: proposal.side,
      reason: decision.reason,
      confidencePct: this.lastConfidencePct,
      entry: proposal.entry,
      stopLoss: proposal.stopLoss,
      takeProfit: proposal.takeProfit,
      riskAmount: decision.risk.riskAmount,
    };
  }

  /** The EA calls this right after trying to place the order MT5-side. */
  reportFill(report: Mt5PushFillReport): void {
    this.assertPushModeEnabled();
    if (report.status === "rejected") {
      this.appendLog(`MT5 rejected order for decision ${report.decisionId}: ${report.reason ?? "no reason given"}`);
      return;
    }
    if (
      report.ticket === undefined ||
      report.entryPrice === undefined ||
      report.stopLoss === undefined ||
      report.takeProfit === undefined ||
      report.volumeLots === undefined
    ) {
      throw new Error("A filled report requires ticket, entryPrice, stopLoss, takeProfit, and volumeLots");
    }
    this.openMt5PositionsByTicket.set(report.ticket, {
      symbol: report.symbol,
      side: report.side,
      entryPrice: report.entryPrice,
      stopLoss: report.stopLoss,
      takeProfit: report.takeProfit,
      volumeLots: report.volumeLots,
      openedAtMs: report.timestampMs,
    });
    this.account.openPositions += 1;
    this.appendLog(
      `${report.side.toUpperCase()} filled on MT5 - ticket ${report.ticket} - ${report.volumeLots} lots @ ${report.entryPrice} (decision ${report.decisionId})`,
    );
  }

  /** The EA calls this once MT5 closes a position (stop, target, or manual close). */
  reportClose(report: Mt5PushCloseReport): void {
    this.assertPushModeEnabled();
    const opened = this.openMt5PositionsByTicket.get(report.ticket);
    this.openMt5PositionsByTicket.delete(report.ticket);
    this.account.openPositions = Math.max(0, this.account.openPositions - 1);
    this.account.dailyPnl += report.realizedPnl;

    const position: Position = opened
      ? {
          id: `mt5-${report.ticket}`,
          orderId: `mt5-${report.ticket}`,
          symbol: opened.symbol,
          side: opened.side,
          units: opened.volumeLots * UNITS_PER_LOT,
          entryPrice: opened.entryPrice,
          currentPrice: report.exitPrice,
          stopLoss: opened.stopLoss,
          takeProfit: opened.takeProfit,
          openedAtMs: opened.openedAtMs,
          closedAtMs: report.closedAtMs,
          exitPrice: report.exitPrice,
          status: "closed",
          unrealizedPnl: 0,
          realizedPnl: report.realizedPnl,
        }
      : {
          // We lost track of this ticket (e.g. service restarted). Still
          // record the outcome so P/L and streaks stay accurate, with a
          // clearly-flagged unknown risk amount rather than guessing one.
          id: `mt5-${report.ticket}`,
          orderId: `mt5-${report.ticket}`,
          symbol: SYMBOL,
          side: "buy", // arbitrary: side is unknown once we've lost the ticket, and units=0 makes it inert
          units: 0,
          entryPrice: report.exitPrice,
          currentPrice: report.exitPrice,
          stopLoss: report.exitPrice,
          takeProfit: report.exitPrice,
          openedAtMs: report.closedAtMs,
          closedAtMs: report.closedAtMs,
          exitPrice: report.exitPrice,
          status: "closed",
          unrealizedPnl: 0,
          realizedPnl: report.realizedPnl,
        };
    if (!opened) {
      this.appendLog(`Closed ticket ${report.ticket} with no matching open record (service may have restarted)`);
    }
    this.recordOutcome(position, report.closedAtMs);
  }

  private pushWait(decisionId: string, reason: string): Mt5PushDecision {
    this.lastDecision = "WAIT";
    this.lastReason = reason;
    return { decisionId, action: "wait", reason, confidencePct: this.lastConfidencePct };
  }

  private assertPushModeEnabled(): void {
    if (!this.mt5PushAllowlist) {
      throw new Error("MT5 push mode is not configured on this service (mt5PushAllowlist missing)");
    }
  }

  private assertAllowlisted(login: number, server: string): void {
    const allowlist = this.mt5PushAllowlist!;
    if (login !== allowlist.login || server !== allowlist.server) {
      throw new Error("MT5 account is not allowlisted for this GreenBrain instance");
    }
  }

  addKnowledge(source: KnowledgeSource, item: KnowledgeItem): void {
    this.knowledgeBase.addSource(source);
    this.knowledgeBase.addItem(item);
    this.appendLog(`Knowledge added: ${item.summary.slice(0, 80)}`);
  }

  getKnowledgeBrief(symbol?: string): KnowledgeBrief {
    return this.knowledgeBase.brief({
      ...(symbol !== undefined ? { symbol } : {}),
      timestampMs: Date.now(),
    });
  }

  /** Advances the whole intelligence -> risk -> execution -> memory pipeline by one step. */
  async tick(nowMs: number): Promise<void> {
    const settings = this.settingsStore.get();
    if (this.halted || !settings.automationRunning) return;

    const heartbeatError = await this.refreshBrokerHeartbeat(nowMs);
    if (heartbeatError) {
      this.lastDecision = "WAIT";
      this.lastConfidencePct = 0;
      this.lastReason = heartbeatError;
      this.appendLog(`Broker connectivity issue: ${heartbeatError}`);
      return;
    }

    let snapshot: MarketSnapshot;
    try {
      snapshot = await this.broker.getSnapshot(SYMBOL, nowMs);
    } catch (error) {
      this.lastDecision = "WAIT";
      this.lastConfidencePct = 0;
      this.lastReason = `Market data unavailable: ${error instanceof Error ? error.message : "unknown error"}`;
      this.appendLog(this.lastReason);
      return;
    }
    this.lastMarket = snapshot;
    this.tickCount += 1;

    const feedHealth = this.watchdog.evaluate(snapshot.timestampMs, nowMs);
    this.accumulateBar(snapshot);
    this.signalGenerator.observe(snapshot);
    if (this.bars.length >= 8) {
      this.historicalContext = this.marketIntelligence.analyze(this.bars);
    }

    this.settleOpenPositions(snapshot, nowMs);
    this.lastSessionProtection = this.sessionProtection.evaluate(this.account.dailyPnl);

    if (!feedHealth.canTrade) {
      this.lastDecision = "WAIT";
      this.lastConfidencePct = 0;
      this.lastReason = feedHealth.reason;
      return;
    }

    const proposal = this.signalGenerator.propose(snapshot, this.tickCount);
    if (!proposal) {
      this.lastDecision = "WAIT";
      this.lastConfidencePct = 0;
      this.lastReason = this.historicalContext
        ? this.marketIntelligence.explain(this.historicalContext)
        : "Building short-term momentum context before proposing a trade.";
      return;
    }
    this.lastConfidencePct = Math.round(proposal.confidence * 100);

    if (this.account.openPositions >= 1) {
      this.lastDecision = "WAIT";
      this.lastReason = "GreenBrain is managing an open position and will not stack new exposure.";
      return;
    }

    if (this.lastSessionProtection.pauseNewTrades) {
      this.lastDecision = "WAIT";
      this.lastReason = this.lastSessionProtection.reason;
      return;
    }

    const policy = riskPolicyFor(settings);
    const core = new GreenBrainCore(this.engine, this.execution, this.journal);
    const result = await core.processSignal({
      tradingMode: "demo",
      automationMode: "automatic",
      policy,
      account: this.account,
      market: snapshot,
      proposal,
      timestampMs: nowMs,
      ...(this.historicalContext !== undefined ? { historicalContext: this.historicalContext } : {}),
      feedHealth,
    });

    if (result.decision.status !== "approved") {
      this.lastDecision = "WAIT";
      this.lastReason = result.decision.reason;
      this.experience.recordRejection({
        id: `reject-${proposal.id}`,
        opportunityId: proposal.id,
        strategyId: this.strategyId,
        symbol: proposal.symbol,
        regime: this.historicalContext?.trend ?? "unknown",
        rejectedAtMs: nowMs,
        reason: result.decision.reason,
        outOfSample: false,
      });
      return;
    }

    this.lastDecision = proposal.side === "buy" ? "BUY" : "SELL";
    this.lastReason = result.decision.reason;
    this.account.openPositions += 1;
    this.appendLog(
      `${this.lastDecision} opened - confidence ${this.lastConfidencePct}% - risk $${result.decision.risk.riskAmount.toFixed(2)}`,
    );
  }

  getTelemetry(): GreenBrainTelemetry {
    const settings = this.settingsStore.get();
    const nowMs = Date.now();
    const feedHealth: FeedHealthReport = this.lastMarket
      ? this.watchdog.evaluate(this.lastMarket.timestampMs, nowMs)
      : { status: "offline", ageMs: Number.POSITIVE_INFINITY, canTrade: false, reason: "No market data has been received yet" };

    const totalClosed = this.wins + this.losses;
    const winStreak = this.trailingStreak((value) => value > 0);
    const lossStreak = this.trailingStreak((value) => value < 0);

    let riskAdvice: RiskAdvice | undefined;
    if (this.recentResults.length > 0) {
      riskAdvice = this.riskAdvisor.advise({
        currentRiskAmount: settings.riskPerTradeAmount,
        dailyPnl: this.account.dailyPnl,
        dailyLossLimit: settings.dailyLossLimit,
        recentNetResults: this.recentResults,
        maximumAllowedRiskAmount: Math.max(settings.riskPerTradeAmount, 500),
      });
    }

    const systemState = this.halted
      ? "HALTED"
      : !settings.automationRunning
        ? "PAUSED"
        : riskAdvice?.state === "review-increase" && settings.streakAlertEnabled
          ? "RISK-REVIEW"
          : "PROTECTED";

    return {
      timestampMs: nowMs,
      running: settings.automationRunning && !this.halted,
      halted: this.halted,
      systemState,
      broker: { id: this.broker.id, usingRealMt5: this.usingInjectedBroker, pushModeEnabled: this.mt5PushAllowlist !== undefined },
      feedHealth,
      market: this.lastMarket
        ? {
            symbol: this.lastMarket.symbol,
            bid: this.lastMarket.bid,
            ask: this.lastMarket.ask,
            mid: (this.lastMarket.bid + this.lastMarket.ask) / 2,
          }
        : undefined,
      decision: this.lastDecision,
      confidencePct: this.lastConfidencePct,
      reason: this.lastReason,
      marketMemory: this.historicalContext
        ? {
            periodHigh: this.historicalContext.periodHigh,
            periodLow: this.historicalContext.periodLow,
            rangePositionPct: Math.round(this.historicalContext.rangePosition * 100),
            volatilityBps: Math.round(this.historicalContext.volatilityFraction * 10_000 * 100) / 100,
            trend: this.historicalContext.trend,
            action: postureLabel(this.historicalContext.posture),
            text: this.marketIntelligence.explain(this.historicalContext),
          }
        : undefined,
      account: { ...this.account },
      today: {
        profit: this.account.dailyPnl,
        wins: this.wins,
        losses: this.losses,
        winRatePct: totalClosed ? Math.round((this.wins / totalClosed) * 100) : 0,
      },
      streak: { winStreak, lossStreak },
      sessionProtection: { ...this.lastSessionProtection },
      riskAdvice,
      history: [...this.history],
      log: [...this.log],
    };
  }

  private async refreshBrokerHeartbeat(nowMs: number): Promise<string | undefined> {
    const maybeHeartbeat = this.broker as Partial<{ refreshHeartbeat(nowMs: number): Promise<void> }>;
    if (typeof maybeHeartbeat.refreshHeartbeat !== "function") return undefined;
    try {
      await maybeHeartbeat.refreshHeartbeat(nowMs);
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : "Broker heartbeat check failed";
    }
  }

  private applySettings(settings: GreenBrainSettings): void {
    this.engine = new TradingEngine(engineConfigFor(settings));
    this.sessionProtection = new SessionProtection({
      profitTargetAmount: settings.dailyProfitGoal,
      activateProfitLockAtAmount: Math.max(1, settings.dailyProfitGoal * 0.5),
      maxGivebackAmount: Math.max(1, settings.dailyProfitGoal * 0.35),
    });
  }

  private accumulateBar(snapshot: MarketSnapshot): void {
    this.barBuffer.push(snapshot);
    if (this.barBuffer.length < TICKS_PER_BAR) return;
    const mids = this.barBuffer.map((s) => (s.bid + s.ask) / 2);
    const bar: HistoricalBar = {
      timestampMs: snapshot.timestampMs,
      open: mids[0]!,
      high: Math.max(...mids),
      low: Math.min(...mids),
      close: mids.at(-1)!,
    };
    this.bars.push(bar);
    if (this.bars.length > MAX_BARS) this.bars.shift();
    this.barBuffer = [];
  }

  private settleOpenPositions(snapshot: MarketSnapshot, nowMs: number): void {
    for (const position of this.positionLedger.openPositions()) {
      const exitPrice = this.exitPriceFor(position, snapshot);
      if (exitPrice === undefined) {
        this.positionLedger.mark(position.id, position.side === "buy" ? snapshot.bid : snapshot.ask);
        continue;
      }
      const closed = this.positionLedger.close(position.id, exitPrice, nowMs);
      this.account.dailyPnl += closed.realizedPnl;
      this.account.openPositions = Math.max(0, this.account.openPositions - 1);
      this.recordOutcome(closed, nowMs);
    }
  }

  private exitPriceFor(position: Position, snapshot: MarketSnapshot): number | undefined {
    if (position.side === "buy") {
      if (snapshot.bid <= position.stopLoss) return position.stopLoss;
      if (snapshot.bid >= position.takeProfit) return position.takeProfit;
    } else {
      if (snapshot.ask >= position.stopLoss) return position.stopLoss;
      if (snapshot.ask <= position.takeProfit) return position.takeProfit;
    }
    return undefined;
  }

  private recordOutcome(position: Position, nowMs: number): void {
    this.recentResults.push(position.realizedPnl);
    if (this.recentResults.length > MAX_RECENT_RESULTS) this.recentResults.shift();
    if (position.realizedPnl > 0) this.wins += 1;
    else if (position.realizedPnl < 0) this.losses += 1;

    this.history.unshift({
      timeIso: new Date(nowMs).toISOString(),
      side: position.side === "buy" ? "BUY" : "SELL",
      riskAmount: Math.abs(position.entryPrice - position.stopLoss) * position.units,
      result: position.realizedPnl,
    });
    this.history = this.history.slice(0, MAX_HISTORY_ROWS);

    this.appendLog(
      `${position.side.toUpperCase()} closed ${position.realizedPnl >= 0 ? "+" : ""}$${position.realizedPnl.toFixed(2)}`,
    );

    const riskAmount = Math.max(0.01, Math.abs(position.entryPrice - position.stopLoss) * position.units);
    try {
      this.experience.recordExecution({
        id: `exec-${position.id}-${position.closedAtMs}`,
        opportunityId: position.orderId,
        strategyId: this.strategyId,
        symbol: position.symbol,
        regime: this.historicalContext?.trend ?? "unknown",
        side: position.side,
        entryPrice: position.entryPrice,
        exitPrice: position.exitPrice!,
        units: position.units,
        initialRiskAmount: riskAmount,
        spreadCost: 0,
        commission: 0,
        slippageCost: 0,
        maximumFavorablePnl: Math.max(0, position.realizedPnl),
        maximumAdversePnl: Math.min(0, position.realizedPnl),
        openedAtMs: position.openedAtMs,
        closedAtMs: position.closedAtMs!,
        outOfSample: false,
      });
    } catch (error) {
      // ExperienceLoop is memory/analytics, not the authoritative P/L record.
      // A degenerate input (e.g. a close report with no matching open
      // record, so units/prices are placeholders) should never block the
      // real dailyPnl/history/streak update above from taking effect.
      this.appendLog(
        `Experience loop could not record this outcome: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }

    void this.journal.recordPosition(position, nowMs);
  }

  private trailingStreak(predicate: (value: number) => boolean): number {
    let count = 0;
    for (let index = this.recentResults.length - 1; index >= 0; index -= 1) {
      if (!predicate(this.recentResults[index]!)) break;
      count += 1;
    }
    return count;
  }

  private appendLog(message: string): void {
    this.log.unshift(message);
    this.log = this.log.slice(0, MAX_LOG_LINES);
  }

  private seedKnowledgeBase(): void {
    const retrievedAtMs = Date.now();

    this.knowledgeBase.addSource({
      id: "internal-risk-playbook",
      type: "internal",
      title: "GreenBrain deterministic risk playbook",
      retrievedAtMs,
      credibility: 0.95,
    });
    this.knowledgeBase.addItem({
      id: "note-risk-streak",
      sourceId: "internal-risk-playbook",
      summary:
        "Winning streaks are a review trigger, not automatic permission to raise risk; the customer must confirm any increase.",
      tags: ["risk", "streak"],
      marketSymbols: [],
      createdAtMs: retrievedAtMs,
      confidence: 0.9,
      executionRelevant: false,
    });

    // Researched sources below (web_search, current at seeding time). Summaries
    // are paraphrased, not quoted, and kept short per copyright constraints.
    // These inform engineering decisions in this codebase (e.g. the
    // volatility-adjusted stop distance in signal-generator.ts) - they are
    // context for GreenBrain's reasoning, never a direct trigger for orders.
    this.knowledgeBase.addSource({
      id: "web-volatility-position-sizing",
      type: "web",
      title: "Volatility-based position sizing using ATR",
      url: "https://www.quantifiedstrategies.com/volatility-based-position-sizing/",
      retrievedAtMs,
      credibility: 0.7,
    });
    this.knowledgeBase.addItem({
      id: "note-atr-sizing",
      sourceId: "web-volatility-position-sizing",
      summary:
        "Sizing positions from a volatility measure (ATR or realized-return standard deviation) instead of a fixed distance keeps dollar risk consistent " +
        "across calm and choppy conditions: the stop widens automatically when the market gets noisier and tightens when it calms down. GreenBrain's " +
        "signal generator implements this directly (volatility-adjusted stop distance with a floor).",
      tags: ["risk", "position-sizing", "volatility", "atr"],
      marketSymbols: [],
      createdAtMs: retrievedAtMs,
      confidence: 0.75,
      executionRelevant: true,
    });

    this.knowledgeBase.addSource({
      id: "web-portfolio-heat",
      type: "web",
      title: "Portfolio heat limits and dynamic exposure",
      url: "https://blog.traderspost.io/article/position-sizing-algorithms",
      retrievedAtMs,
      credibility: 0.65,
    });
    this.knowledgeBase.addItem({
      id: "note-portfolio-heat",
      sourceId: "web-portfolio-heat",
      summary:
        "A portfolio heat limit caps total risk across all open positions as a fraction of equity, and can tighten automatically during high-volatility " +
        "periods. GreenBrain's single-open-position rule is a conservative version of this idea; a natural next step once multi-position support exists " +
        "is a dynamic heat cap tied to the same volatility measure used for stop sizing.",
      tags: ["risk", "portfolio-heat", "volatility"],
      marketSymbols: [],
      createdAtMs: retrievedAtMs,
      confidence: 0.6,
      executionRelevant: false,
    });

    this.knowledgeBase.addSource({
      id: "web-regime-detection",
      type: "research",
      title: "Market regime detection with statistical and ML methods",
      url: "https://questdb.com/glossary/market-regime-change-detection-with-ml/",
      retrievedAtMs,
      credibility: 0.65,
    });
    this.knowledgeBase.addItem({
      id: "note-regime-detection",
      sourceId: "web-regime-detection",
      summary:
        "Regime detection treats trending, ranging, and high/low-volatility conditions as distinct hidden states that a market moves between, commonly " +
        "estimated with Hidden Markov Models or clustering over volatility and trend features. GreenBrain's MarketIntelligence already classifies trend " +
        "and volatility from historical bars; a Hidden-Markov-style regime layer on top is the logical next step, not yet implemented.",
      tags: ["regime-detection", "market-intelligence", "research"],
      marketSymbols: [],
      createdAtMs: retrievedAtMs,
      confidence: 0.6,
      executionRelevant: false,
    });

    this.knowledgeBase.addSource({
      id: "web-strategy-diversification",
      type: "web",
      title: "Trend-following vs mean-reversion strategy selection by regime",
      url: "https://blog.trader-algoritmico.com/what-is-algorithmic-trading-2026-guide-for-traders/",
      retrievedAtMs,
      credibility: 0.55,
    });
    this.knowledgeBase.addItem({
      id: "note-strategy-by-regime",
      sourceId: "web-strategy-diversification",
      summary:
        "Trend-following approaches tend to perform best in sustained directional moves, while mean-reversion approaches tend to perform best in " +
        "range-bound, choppy conditions; professional desks often run both and allocate capital by current volatility regime rather than picking one " +
        "style permanently. GreenBrain currently runs a single momentum strategy; adding a range/mean-reversion strategy selected by MarketIntelligence's " +
        "trend classification is a concrete way to trade both bullish and bearish/ranging conditions rather than only momentum breakouts.",
      tags: ["strategy", "regime-detection", "diversification"],
      marketSymbols: [],
      createdAtMs: retrievedAtMs,
      confidence: 0.55,
      executionRelevant: false,
    });
  }
}

function describeSettingsChange(previous: GreenBrainSettings, next: GreenBrainSettings): string {
  const changes: string[] = [];
  if (previous.riskPerTradeAmount !== next.riskPerTradeAmount) {
    changes.push(`risk per trade -> $${next.riskPerTradeAmount}`);
  }
  if (previous.style !== next.style) changes.push(`style -> ${next.style}`);
  if (previous.dailyProfitGoal !== next.dailyProfitGoal) changes.push(`profit goal -> $${next.dailyProfitGoal}`);
  if (previous.dailyLossLimit !== next.dailyLossLimit) changes.push(`loss limit -> $${next.dailyLossLimit}`);
  if (previous.streakAlertEnabled !== next.streakAlertEnabled) {
    changes.push(`streak alert -> ${next.streakAlertEnabled ? "on" : "off"}`);
  }
  if (previous.automationRunning !== next.automationRunning) {
    changes.push(next.automationRunning ? "automation resumed" : "automation paused");
  }
  return changes.length ? `Settings updated: ${changes.join(", ")}` : "Settings updated";
}

function postureLabel(posture: HistoricalContext["posture"]): string {
  switch (posture) {
    case "favor-long":
      return "FAVOR BUY";
    case "favor-short":
      return "FAVOR SELL";
    case "avoid":
      return "AVOID";
    default:
      return "WAIT";
  }
}
