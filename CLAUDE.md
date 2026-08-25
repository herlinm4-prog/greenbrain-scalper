# GreenBrain — Claude Code Project Context

Read this file before making changes. This repository is not just a trading UI. The product goal is an **intelligent automated market-watching system** that continuously monitors markets, explains decisions in plain language, manages risk, learns from outcomes, and integrates with MT5 for demo execution during development.

## Product purpose

GreenBrain is being designed for users who may know little or nothing about trading. The user should not have to understand lots, pip value, broker mechanics, or MT5 internals. The customer chooses simple controls such as risk in dollars, trading style, daily profit goal, daily loss limit, and whether automation is running. GreenBrain translates those simple preferences into technical execution decisions.

The UX principle is: **complex inside, simple outside**.

The intelligence principle is: **watch continuously, trade selectively**. GreenBrain should be awake all day while markets are open, but should not overtrade. WAIT/HOLD is a valid intelligent decision.

## Current operating state

- MT5 demo connectivity has already been proven operational on the user's Mac.
- Automated trading is enabled in MT5.
- GreenBrain has produced BUY/SELL signals and a demo EURUSD trade was successfully opened with SL/TP.
- The user has observed real demo P/L while GreenBrain was running.
- Do not assume production/live-money readiness.
- Development remains demo/research-first with deterministic risk controls.

## High-level architecture

1. **Market input**
   - Live MT5 quote/bridge data.
   - Historical bars / market memory.
   - Later: validated external market/news/research context.

2. **Intelligence layer**
   - Signal proposal generation.
   - Historical trend/range/support/resistance analysis.
   - Pattern discovery.
   - Knowledge base with provenance.
   - Plain-language explanation/advisor.

3. **Deterministic protection layer**
   - Confidence threshold.
   - Spread limit.
   - Max open positions.
   - Risk per trade.
   - Daily loss limit.
   - Profit lock.
   - Feed freshness watchdog.
   - Shadow-market stress tests.
   - Historical-context execution gate.

4. **Execution layer**
   - GreenBrainCore -> TradingEngine -> RiskEngine -> ExecutionService -> MT5 bridge/broker adapter.
   - AI/advisor must never bypass deterministic checks.

5. **Memory / learning layer**
   - TradingJournal.
   - ExperienceLoop.
   - Strategy attribution.
   - Rejected-trade counterfactual tracking where available.
   - Pattern discovery registry.

6. **Commercial UI**
   - Simple risk controls in dollars.
   - Safe / Balanced / Aggressive modes.
   - Today P/L.
   - Current BUY / SELL / WAIT state.
   - Opportunity confidence.
   - Winning-streak alert.
   - Loss warning.
   - Trading history.
   - Market Memory explanation.
   - Start/Stop and Emergency Stop.

## Important implemented components

The repository currently contains, among others:

- `src/greenbrain-core.ts` — central decision/execution orchestration.
- `src/trading-engine.ts` — confidence, risk, shadow-market, and historical-context gating.
- `src/risk-engine.ts` — deterministic risk policy, now including customer-friendly dollar risk caps.
- `src/market-intelligence.ts` — historical bars -> trend, range position, support, resistance, volatility, posture, cautions.
- `src/market-feed-watchdog.ts` — detects stale/offline market data and blocks execution when data is not trustworthy.
- `src/session-protection.ts` — profit-lock / session protection logic.
- `src/risk-advisor.ts` — interprets winning/losing streaks and suggests risk review; risk increases require user confirmation.
- `src/knowledge-base.ts` — provenance-aware knowledge records for books/web/research/notes.
- `src/experience-loop.ts` — captures execution quality, net R, costs, capture efficiency, profit factor, expectancy, protected capital, and missed opportunities.
- `src/pattern-discovery.ts` — observations/anomalies/hypotheses/reproducible patterns/strategy candidates.
- `src/greenbrain-chat.ts` — advisor/chat command proposals; commands require confirmation where appropriate.
- `src/forex-position-sizer.ts` — position sizing support.
- `src/mt5-bridge.ts` and `src/mt5-http-transport.ts` — MT5 integration boundary.
- `bridge/mt5_bridge.py` — demo-only Python bridge with authentication, symbol allowlist, max lots, duplicate-order blocking, SL/TP validation, and demo-account enforcement.
- `dashboard/` — commercial-facing simplified GreenBrain dashboard.

## Recent completed improvements

The latest audits added and merged:

- Historical highs/lows and market memory.
- Trend/range/support/resistance context.
- Historical-context execution gate.
- Knowledge base with source/provenance metadata.
- Risk Advisor for good/bad streaks.
- Dollar-denominated risk per trade.
- Dollar-denominated daily loss limits.
- Profit-lock session protection.
- Always-on market-feed watchdog.
- GreenBrainCore integration with feed health and historical context.
- Customer-facing dashboard improvements explaining what GreenBrain sees.
- Automated GitHub quality gate running typecheck + tests.

## Commercial UX requirements

The target user should see simple controls, not technical broker fields.

Preferred visible controls:

- Risk per trade: presets such as `$10 / $25 / $50 / $100 / Custom`.
- Trading style: `Safe / Balanced / Aggressive`.
- Daily profit goal.
- Daily loss limit.
- Streak alert / risk-review prompt.
- Start / Stop automation.
- Emergency Stop.
- Today P/L.
- Current trade or WAIT state.
- Win rate / streak.
- Market Memory summary.
- Plain-language explanation: "what GreenBrain sees" and "why it is waiting/trading".

Do **not** make customers manually calculate lots. Risk should be expressed in money; GreenBrain computes position size internally.

## Winning streak behavior

A winning streak is an **alert and review trigger**, not permission to automatically escalate risk.

Example:

- 3 consecutive wins + positive daily P/L -> GreenBrain may recommend reviewing a modest increase.
- The customer confirms any increase.
- GreenBrain must still respect maximum allowed risk and daily/session protections.
- Losing streaks should trigger reduced-risk recommendations or stop conditions.

## Historical intelligence requirement

GreenBrain must learn to identify opportunities using historical context, not only short-term tick momentum.

Historical analysis should consider:

- Period high and low.
- Range position.
- Trend direction and strength.
- Volatility regime.
- Recent support/resistance.
- Distance to historically important zones.
- Time/session behavior when data becomes available.
- Outcomes of previous trades taken under similar regimes.

A good short-term BUY signal near major resistance can still be rejected or downgraded.

## Knowledge / web / books requirement

The long-term product should ingest validated educational and market information from legitimate sources and user-provided/licensed materials. GreenBrain must keep provenance and timestamps. External information is **context**, not a direct execution instruction.

Never let arbitrary web text directly trigger a broker order. Route it through the intelligence layer and deterministic protection layer.

Do not reproduce copyrighted books in full. Store summaries, structured concepts, references, and legally permitted/user-provided material.

## Continuous operation requirement

GreenBrain should be designed to stay awake throughout the trading day and scan continuously. Operational safety is more important than merely staying active.

Required protections for unattended monitoring:

- Detect stale market feeds.
- Block orders on stale/offline data.
- Reconnect safely.
- Avoid duplicate orders.
- Journal failures.
- Preserve state across restarts where practical.
- Never interpret "always on" as "always trade".

## Mac / application experience

The user is operating on Mac. Do not build workflows that depend on Windows-only user interaction.

The intended commercial experience is eventually a normal GreenBrain macOS app/launcher. The user should open GreenBrain without manually using Terminal. A repository-level `start-greenbrain.command` currently exists as an intermediate launcher for the dashboard, but the final product should hide Terminal from the customer.

## Dashboard status

The dashboard currently demonstrates the commercial UX, but some data paths have historically been simulated. A major consolidation goal is to replace simulated dashboard state with live GreenBrainCore/MT5 telemetry so there is one source of truth.

Priority flow:

`MT5 live demo data -> GreenBrain Core -> risk/intelligence -> execution -> MT5 result -> journal/experience memory -> dashboard`

Avoid maintaining a separate fake browser "brain" once live integration is available.

## Immediate consolidation priorities

1. **Single source of truth**
   - Dashboard must consume actual GreenBrainCore/bridge state instead of simulated decisions/P&L.

2. **Unified settings API**
   - Risk amount, daily loss, profit target, automation mode, and style should be stored centrally and consumed by the risk/execution engine.

3. **Telemetry API**
   - Expose safe read-only status for dashboard: feed health, latest market context, latest decision, reason, confidence, open positions, P/L, streak, risk state, recent journal events.

4. **Historical data pipeline**
   - Feed real historical bars to `MarketIntelligence` from MT5 or a normalized provider.

5. **Trade outcome ingestion**
   - Ensure closed MT5 positions update ExperienceLoop/TradingJournal automatically.

6. **Persistence**
   - Persist user settings, historical observations, experience records, and session protection state.

7. **Advisor grounding**
   - GreenBrain Advisor should answer from actual current telemetry/history/knowledge, clearly separating facts, inference, and education.

8. **Packaging**
   - Create a Mac-friendly one-click launcher/app that starts required local services, verifies MT5/bridge health, and opens GreenBrain.

9. **Deployment**
   - A remote dashboard may be used for preview, but real local MT5 execution must not expose sensitive local bridge credentials publicly.

## Engineering rules

- Preserve deterministic risk boundaries.
- No direct AI-to-broker calls.
- No risk increase without policy checks and explicit confirmation where appropriate.
- Keep demo-only bridge protection until an explicit production design review is completed.
- Reject stale market data.
- Maintain idempotency/duplicate-order protection.
- Prefer additive, isolated changes over broad rewrites.
- Fix regressions before adding unrelated features.
- Keep tests and typecheck green before merging.
- Do not remove working MT5 bridge behavior while improving UI/intelligence.
- UI customer language should remain simple and primarily English unless explicitly changed.

## Current repository workflow

- Default branch: `main`.
- Use feature branches and PRs for material changes.
- CI quality gate should pass before merge.
- Existing tests are important because this system controls trading decisions even in demo mode.

## What Claude Code should do first

When opening this repository:

1. Read `CLAUDE.md` completely.
2. Read `docs/PROJECT_MEMORY.md` for the chronological project history and decisions.
3. Inspect current `main` before proposing rewrites.
4. Run `npm install`, `npm run typecheck`, and `npm test` when the environment allows.
5. Audit the live data path from MT5 -> core -> dashboard.
6. Propose the smallest coherent consolidation plan that removes duplicate/simulated state while preserving working demo execution.
7. Work autonomously where safe, but do not weaken risk controls or silently enable live-money trading.
