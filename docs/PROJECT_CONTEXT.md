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

## AI-native product definition

GreenBrain Scalper is an artificial intelligence system specialized in short-horizon scalping, not merely an Expert Advisor, fixed-rule bot, signal dashboard, or MT5 remote control. Its intelligence layer must analyze context and microstructure, generate competing hypotheses, express calibrated uncertainty, abstain when evidence is insufficient, and improve through versioned evaluation of recorded experience. Deterministic risk and execution components remain separate and authoritative so that model output cannot bypass safety controls.

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

## Strategy discovery and promotion

The learning system must explicitly estimate luck-versus-skill attribution. It will quantify the probability that net expectancy is positive and repeatable using sample sufficiency, uncertainty intervals or posterior probability, bootstrap/permutation testing, walk-forward and untouched out-of-sample evaluation, regime consistency, counterfactual baselines, execution-cost sensitivity, and multiple-testing correction. Strategy promotion thresholds must be configurable and auditable.

Profitable patterns, features, decision functions, and contextual behaviors are retained as attributed evidence and may generate versioned strategy candidates. A winning trade or short profitable period never authorizes automatic activation. Candidates must pass minimum-sample, net-expectancy, drawdown, regime-stability, replay, out-of-sample, execution-cost, and independent demo shadow gates. Approved candidates enter the active strategy registry with lineage, metrics, limits, and rollback support. Losing trades, abstentions, and rejected proposals remain part of the evidence set to avoid survivorship bias.

## Strategy Research Library

GreenBrain must generate diverse strategy and methodology candidates from accumulated evidence and maintain a user-facing, exportable compilation. Each versioned strategy document must include its hypothesis, discovered pattern, instruments and regimes, required features, entry/exit and abstention logic, invalidation conditions, risk assumptions, expected holding horizon, transaction-cost sensitivity, supporting and contradicting evidence, sample size, validation results, failure modes, confidence, lineage, and status. The system must also surface unusual behaviors through anomaly reports, explain why they are unusual, search for repeatability and plausible market mechanisms, and clearly distinguish observation, hypothesis, candidate, validated strategy, and retired strategy. Periodic discovery reports must provide actionable information without presenting noise as fact.

## Continuous Market Intelligence

GreenBrain must maintain an ongoing research pipeline for new trading research, official market and broker information, market-structure developments, authorized educational material, and selected practitioner discussions. Exhaustive internet coverage is neither possible nor a quality target. Sources must be allowlisted and tiered by authority, with provenance, author, publication and retrieval dates, market relevance, claims, contradictions, and applicable instruments preserved. External content is untrusted research input: it is isolated from execution instructions, deduplicated, checked for prompt injection and manipulation, compared against contrary evidence, and converted only into observations or hypotheses. No internet claim may modify an active strategy or trigger an order without independent market-data validation and normal promotion gates. Research outputs feed idea generation, anomaly investigation, knowledge-gap tracking, and user-facing intelligence briefs.

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

## MetaTrader 5 target architecture

- The user's Apple Silicon iMac is the control and development workstation.
- MetaTrader 5 and the GreenBrain MT5 Bridge will run on a Windows VPS near the broker server.
- The first bridge uses the official MetaTrader 5 Python integration; a native MQL5 Expert Advisor bridge may be evaluated later for latency-sensitive execution.
- MT5 integration remains demo-only, with account allowlisting, heartbeat fail-closed behavior, idempotency, a dedicated magic number, and broker-hosted stop-loss/take-profit protection.
- Closing or disconnecting the iMac must not interrupt the VPS execution boundary or safety controls.

## Cloud deployment requirement

- GreenBrain Scalper must run continuously without depending on the user's iMac being powered on.
- The user-facing product is a responsive web application/PWA designed for macOS browsers, iPhone, tablets, and other modern devices; it is not a Windows desktop application.\n- Windows is only an infrastructure detail for the hidden MT5 execution connector on its VPS; users never need to operate GreenBrain through Windows.

- Internet-facing application services and persistent data will run in managed cloud infrastructure.
- MetaTrader 5 and its execution bridge will run on a dedicated Windows VPS near the broker server.
- Client devices are supervision and control surfaces only; closing them must not interrupt the engine.
- Remote access requires HTTPS, authenticated sessions, role-aware control, audit logging, and step-up confirmation for sensitive actions.
- Cloud service failure or loss of heartbeat must fail closed for new orders while preserving broker-hosted protective stops.

## Current next milestone

- Discuss and design MetaTrader 5 integration.
- Durable persistence for trades and decisions.
- Open and closed position lifecycle.
- Realized and unrealized P&L.
- Connect dashboard state to GreenBrain Core.
- Maintain demo-only enforcement.

## Conversation logging rule

After every substantive user or assistant message about this project, append the date, speaker, request/outcome, and any new permanent decision to `docs/CONVERSATION_LOG.md`. Preserve intent faithfully, but do not store secrets, credentials, encrypted key material, tool-internal output, or irrelevant personal data.
