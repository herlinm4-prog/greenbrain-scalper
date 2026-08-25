# GreenBrain Project Memory

This document exists to preserve linear context for AI coding agents and future contributors.

## 2026-08-24 — MT5 connection and first successful automated demo trade

- Work focused on getting GreenBrain connected to MetaTrader 5 on Mac.
- MT5 automated trading was enabled successfully.
- GreenBrain Core was running locally and receiving EURUSD market requests.
- Early behavior was mostly HOLD because the decision logic was too conservative/simple.
- A more sensitive momentum/trend decision loop was tested.
- GreenBrain produced its first BUY signal and later high-confidence SELL signals.
- MT5 Experts/Journal were inspected to verify execution behavior.
- A real **demo** EURUSD BUY position appeared in MT5.
- The observed trade showed approximately 1.00 lot, entry around 1.16651, SL around 1.16351, TP around 1.17101. This proved the end-to-end demo path could open a protected trade.
- During continued testing, the user reported the demo session was approximately +$30 at one point.
- Important conclusion: technical execution worked, but risk/position sizing had to become easier and safer for non-traders.

## Commercial product direction established

GreenBrain is intended to be commercially usable by people who do not know trading.

Core UX decisions:

- The customer chooses **money at risk**, not lots.
- GreenBrain calculates lot/position size internally.
- Simple visible presets: `$10 / $25 / $50 / $100 / Custom`.
- Simple operating modes: `Safe / Balanced / Aggressive`.
- Daily Profit Goal and Daily Loss Limit.
- Start/Stop automation and Emergency Stop.
- Green/amber/red visual states for winning/waiting/risk conditions.
- Clear profit alerts.
- Current state should be easy to understand: BUY / SELL / WAIT.
- Dashboard should make trading easier, not expose MT5 complexity.

## Winning streak / risk review concept

User requested a good-streak alert so customers can increase risk when performance is strong.

Decision:

- GreenBrain may detect a **GREEN STREAK** after a meaningful sequence of profitable trades.
- It may suggest a modest risk increase.
- Risk does **not** increase automatically just because of a streak.
- User confirmation is required.
- Losing streaks should trigger risk-reduction guidance or session protection.

This evolved into `src/risk-advisor.ts`.

## Dashboard commercial redesign

The dashboard was changed from a technical/demo-looking screen toward a simple commercial control center.

Features added to the UI included:

- Today P/L.
- Risk per trade.
- Win streak.
- System status.
- Dollar risk buttons.
- Trading style.
- Daily profit goal.
- Daily loss limit.
- Streak alert toggle.
- Profit/risk alerts.
- Trading history / GreenBrain Memory.
- Live monitor.
- Stop Automation.
- Emergency Stop.

A Mac launcher file `start-greenbrain.command` was also added as an intermediate solution to open the dashboard without repeatedly typing server commands.

Long-term decision: the commercial product should be a normal Mac application/launcher with Terminal hidden from the customer.

## Hosting / preview attempt

- A GitHub Pages workflow was added to publish `dashboard/`.
- The repository was private, and the current GitHub plan/settings did not permit Pages without upgrading or making the repository public.
- Decision: **do not make GreenBrain source public only to get a preview URL**.
- Cloudflare was considered/connected as an alternative private-code deployment path, but deployment actions were not available in the active conversation at that time.

## Intelligence direction expanded

The product requirement was explicitly expanded beyond a normal trading bot.

GreenBrain should:

- Know historical highs and lows.
- Understand trends.
- Detect support/resistance and important price zones.
- Compare current behavior with historical conditions.
- Learn from trade outcomes.
- Read/ingest legitimate research, books/materials, and web information.
- Preserve source provenance.
- Generate useful information and plain-language explanations for the user.
- Explain why it is trading or why it is waiting.

Critical architecture decision:

External information must provide **context**, not direct execution instructions. Any trade still passes deterministic confidence, risk, market, and execution checks.

## Deep intelligence audit

A major code audit was performed with the goal of making GreenBrain an intelligence rather than just a UI.

Implemented and merged into `main`:

### Historical market intelligence

`src/market-intelligence.ts`

- Historical bar ingestion.
- Period high / low.
- Current range position.
- Fast/slow trend analysis.
- Trend classification: strong-up, up, range, down, strong-down.
- Trend strength.
- Historical volatility.
- Recent support/resistance.
- Opportunity posture: favor-long, favor-short, wait, avoid.
- Cautions for entering near resistance/support/extremes.
- Plain-language explanation method.

### Historical context gate

`src/trading-engine.ts` was extended so historical context can be supplied when evaluating a trade.

The engine can reject:

- BUY signals when historical posture favors short/avoid.
- SELL signals when historical posture favors long/avoid.

This prevents short-term momentum from blindly overriding broader context.

### Provenance-aware knowledge base

`src/knowledge-base.ts`

Designed to store knowledge from:

- web,
- books,
- research,
- user notes,
- system-generated knowledge.

Important fields include source title, source reference, publication/access timestamps, tags, content, confidence, and execution relevance.

### Risk Advisor

`src/risk-advisor.ts`

- Detects trailing win streaks.
- Detects loss streaks.
- Recommends review-increase after a strong positive sequence.
- Recommends reducing exposure after consecutive losses.
- Stops new risk at the daily loss boundary.
- Increases require user confirmation.

### Chat / Advisor expansion

`src/greenbrain-chat.ts` command vocabulary expanded to support concepts such as:

- market analysis,
- historical context,
- strategy report,
- risk review,
- trade history,
- learning summary,
- knowledge brief.

## Risk model simplified for customers

The deterministic risk system was extended to support easy customer settings.

`RiskPolicy` now supports optional dollar-denominated controls such as:

- `maxRiskAmount`
- `maxDailyLossAmount`

The risk engine uses the stricter value when both percentage and dollar caps exist.

This supports a customer choosing `$25 risk` without understanding lots.

## Profit lock / session protection

`src/session-protection.ts`

Added a session-level protection concept:

- Track peak daily P/L.
- Once enough profit has been achieved, protect a configurable portion of the peak.
- If P/L falls below the protected level, pause/stop new exposure.
- Daily loss remains a hard stop.

Purpose: prevent a strong session from giving back excessive profit.

## Continuous all-day monitoring hardening

The user specifically wants GreenBrain awake all day to watch opportunities.

Key interpretation:

**Always watching does not mean always trading.**

`src/market-feed-watchdog.ts` was added to detect:

- healthy feed,
- degraded feed,
- stale feed,
- offline/no feed.

GreenBrainCore now accepts optional feed-health context and refuses to execute if the market feed is not healthy.

This protects unattended operation from stale quotes or broken connectivity.

## GreenBrainCore consolidation

`src/greenbrain-core.ts` was extended to accept richer context while preserving old call paths:

- optional historical context,
- optional feed health.

The execution sequence remains:

1. Check feed health.
2. Evaluate signal through TradingEngine.
3. Journal decision.
4. If rejected -> no execution.
5. If assisted -> wait for confirmation.
6. If automatic and approved -> ExecutionService.

## Quality control

A GitHub Actions quality gate was introduced.

It runs:

- `npm install`
- `npm run typecheck`
- `npm test`

An initial CI failure was caused by enabling npm cache without a lockfile. The workflow was fixed. Subsequent quality gate passed before merges.

## Current safety boundaries

Development remains demo-first.

The Python MT5 bridge contains protections including:

- Bearer-token authentication.
- Explicit demo login/server allowlist.
- Hard block on non-demo account.
- Allowed symbol list.
- Maximum lot cap.
- Duplicate-order blocking via local DB.
- Magic number validation.
- Buy/Sell SL/TP structural validation.
- `order_check` before `order_send`.

These protections must not be casually removed.

## Key current weakness

The biggest consolidation problem is now architectural rather than visual:

**The browser dashboard has used simulated state while GreenBrainCore/MT5 have real state.**

This creates the risk of two separate truths:

- fake UI state,
- actual core/MT5 state.

The next major milestone should eliminate that split.

Target:

`MT5 demo -> bridge -> GreenBrain Core -> deterministic risk/intelligence -> execution -> trade result -> journal/experience -> dashboard`

The dashboard should become a client of real telemetry rather than independently pretending to be the Brain.

## Recommended next implementation sequence

1. Build a local GreenBrain service/API that owns runtime settings and telemetry.
2. Expose read-only dashboard telemetry endpoints.
3. Add controlled settings endpoints for risk amount, daily limits, style, and automation state.
4. Connect MT5 historical bar retrieval to MarketIntelligence.
5. Ingest closed MT5 trades into TradingJournal + ExperienceLoop.
6. Compute real streaks from actual closed results.
7. Drive RiskAdvisor from actual history.
8. Drive GreenBrain Advisor from live telemetry + historical context + knowledge base.
9. Remove simulated dashboard decisions/P&L when equivalent real data exists.
10. Package the local stack as a one-click Mac application/launcher.
11. Add safe reconnect/restart/state persistence.
12. Only after extensive demo validation, separately design any live-money migration; never silently repurpose demo protections.

## Product identity to preserve

GreenBrain is not intended to be another generic trading dashboard.

The product promise is effectively:

> The customer tells GreenBrain how much risk they are comfortable with. GreenBrain stays awake, studies the market, waits for qualified opportunities, manages technical execution, protects the account, remembers results, and explains what it is doing in simple language.

That principle should guide engineering and visual decisions.
