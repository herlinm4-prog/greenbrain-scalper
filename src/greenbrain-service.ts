import { GreenBrainCore } from "./greenbrain-core.js";
import { TradingEngine } from "./trading-engine.js";
import { ExecutionService } from "./execution-service.js";
import { ExecutionLedger } from "./execution-ledger.js";
import { PositionLedger, type Position } from "./position-ledger.js";
import { PaperBroker } from "./paper-broker.js";
import { ForexDemoFeed } from "./simulator.js";
import { InMemoryJournalStore, TradingJournal } from "./trading-journal.js";
import { MarketWatchdog, type FeedHealthReport } from "./market-watchdog.js";
import { MarketIntelligence, type HistoricalBar, type HistoricalContext } from "./market-intelligence.js";
import { SessionProtection, type SessionProtectionState } from "./session-protection.js";
import { RiskAdvisor, type RiskAdvice } from "./risk-advisor.js";
import { ExperienceLoop } from "./experience-loop.js";
import { GreenBrainKnowledgeBase, type KnowledgeItem, type KnowledgeSource, type KnowledgeBrief } from "./knowledge-base.js";
import { MomentumSignalGenerator } from "./signal-generator.js";
import { riskPolicyFor, engineConfigFor } from "./style-policy.js";
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

export interface GreenBrainServiceConfig {
  settingsPersistence?: SettingsPersistence;
  seed?: number;
}

export class GreenBrainService {
  private readonly feed: ForexDemoFeed;
  private readonly broker: PaperBroker;
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

  private constructor(config: GreenBrainServiceConfig) {
    this.feed = new ForexDemoFeed({
      symbol: SYMBOL,
      broker: "greenbrain-paper",
      initialMid: 1.1,
      spreadBps: 0.8,
      volatilityBps: 1.4,
      seed: config.seed ?? 91,
    });
    this.broker = new PaperBroker({ id: "greenbrain-paper", slippageBps: 0.3, feed: this.feed });
    this.journal = new TradingJournal(this.journalStore);
    this.execution = new ExecutionService(this.broker, this.executionLedger, this.positionLedger, this.journal);
    this.signalGenerator = new MomentumSignalGenerator({
      symbol: SYMBOL,
      lookback: 6,
      stopDistanceBps: 12,
      rewardToRisk: 1.6,
    });
    this.seedKnowledgeBase();
  }

  static async create(config: GreenBrainServiceConfig = {}): Promise<GreenBrainService> {
    const service = new GreenBrainService(config);
    service.settingsStore = await SettingsStore.create(config.settingsPersistence);
    service.applySettings(service.settingsStore.get());
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

    const snapshot = await this.broker.getSnapshot(SYMBOL, nowMs);
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
    this.knowledgeBase.addSource({
      id: "internal-risk-playbook",
      type: "internal",
      title: "GreenBrain deterministic risk playbook",
      retrievedAtMs: Date.now(),
      credibility: 0.95,
    });
    this.knowledgeBase.addItem({
      id: "note-risk-streak",
      sourceId: "internal-risk-playbook",
      summary:
        "Winning streaks are a review trigger, not automatic permission to raise risk; the customer must confirm any increase.",
      tags: ["risk", "streak"],
      marketSymbols: [],
      createdAtMs: Date.now(),
      confidence: 0.9,
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
