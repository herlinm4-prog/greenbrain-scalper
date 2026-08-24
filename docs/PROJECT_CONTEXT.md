# GreenBrain Scalper — Permanent Project Context

This file is the durable handoff for every future development session. It records product decisions, constraints, and conversation outcomes without storing credentials, private keys, encrypted secret payloads, or tool-internal data.

## Project identity

- Product: **GreenBrain Scalper**
- Parent brand: **GreenBrain**
- Repository: `herlinm4-prog/greenbrain-scalper`
- Repository visibility: private
- Initial market: Forex
- Initial trading style: scalping over seconds or minutes
- Initial execution environment: demo/paper accounts only
- User-facing language: English unless explicitly changed

## Permanent operating principles

- Build a multimarket and multibroker platform even though Forex is the first integration.
- Support assisted and automatic modes.
- Never promise certainty or guaranteed profitability.
- Optimize for positive statistical expectancy, controlled drawdown, and survival—not raw win rate.
- AI may propose and explain; it must not call a broker directly.
- A deterministic risk engine has authority over AI proposals.
- Risk controls may be fully disabled only in demo mode.
- A non-disableable safety floor must remain if live execution is introduced in the future.
- No real-money execution will be built or enabled during the experimental phase.
- Work autonomously and avoid stopping for minor implementation choices.
- Stop only for credentials, real-money authority, legal decisions, destructive actions, or choices that materially change the product.
- Preserve existing working behavior and make focused, verified changes.

## Differentiating capabilities

### Shadow Market

Stress-test proposals against adverse spread, slippage, latency, entry timing, and volatility before execution.

### Council of intelligence

Specialized analytical roles are planned for regime, microstructure, strategy, adversarial review, risk, execution, and supervision. High disagreement should reduce confidence or produce a no-trade decision.

### Synthetic experience memory

The system may study authorized videos, transcripts, charts, documents, and recorded trading sessions. Its purpose is to accumulate perspectives, questions, methodologies, and contextual judgment. It must not copy or automatically implement a trader's strategy.

Knowledge remains separated into observations, methodologies, general principles, and independently verified evidence. Videos enrich analytical perspective but do not govern execution.

### Multibroker intelligence

Use a universal internal order and quote model. Broker adapters translate universal intents into platform-specific demo requests. Planned integration order:

1. MetaTrader 5 demo
2. OANDA Practice
3. Alpaca Paper
4. Interactive Brokers Paper

### Error memory

Classify losses and failures by signal quality, regime change, news, spread, slippage, latency, stop placement, corrupted data, and broker failure.

## Risk-engine decision

Planned profiles: Conservative, Balanced, Aggressive, Custom, and Risk Engine Off — Demo Only.

Minimum safeguards include maximum risk per trade, maximum daily/weekly loss, exposure caps, position limits, spread/latency thresholds, duplicate protection, abnormal-price detection, news blocking, connection-loss handling, and emergency stop.

## System separation

- **Codex:** builds, tests, documents, and maintains the codebase.
- **AI reasoning layer:** analyzes context and proposes actions through controlled tools.
- **Fast local engine:** handles tick-sensitive calculations and deterministic execution decisions.
- **Risk engine:** final authority.
- **Broker adapters:** demo execution only during development.

## Development history

### Concept phase

The project was corrected from prediction certainty to statistical advantage plus risk control. Multiple platforms, future non-Forex markets, demo accounts, assisted/automatic modes, scalping, synthetic experience from videos, and demo-only risk shutdown were selected.

### Naming phase

AlphaBrain, BrainDriver, Brain, and GreenBrain were rejected because of conflicts or weak differentiation. GreenBrain Scalper was selected as the working product name. Formal trademark clearance remains a future legal task.

### Repository and credentials

- Private GitHub repository created at `herlinm4-prog/greenbrain-scalper`.
- Administrative repository access confirmed.
- A project API key was created through the secure setup process and stored locally outside GitHub.
- `.env` and `.env.local` are ignored.
- Credentials and secret payloads must never be committed.

### Implemented milestones

- Universal market and signal types.
- Deterministic risk engine and demo-only override.
- Shadow-market simulation.
- Deterministic Forex demo feed.
- Trading-decision orchestrator.
- Confidence and survival thresholds.
- Initial English dashboard and emergency stop.
- Universal broker interface.
- Paper broker with simulated slippage.
- Execution ledger.
- Duplicate-order and duplicate-signal protection.
- Technical block against live-broker execution.
- Seven automated tests and strict TypeScript validation passing.

## Current next milestone

- Discuss and design MetaTrader 5 integration.
- Durable persistence for trades and decisions.
- Open and closed position lifecycle.
- Realized and unrealized P&L.
- Connect dashboard state to GreenBrain Core.
- Maintain demo-only enforcement.

## Conversation logging rule

After every substantive user or assistant message about this project, append the date, speaker, request/outcome, and any new permanent decision to `docs/CONVERSATION_LOG.md`. Preserve intent faithfully, but do not store secrets, credentials, encrypted key material, tool-internal output, or irrelevant personal data.
