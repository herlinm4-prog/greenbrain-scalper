# GreenBrain Scalper — Conversation Log

This chronological log preserves project intent and outcomes. It intentionally excludes credentials, secret material, internal tool output, and unrelated personal data.

## 2026-08-23 to 2026-08-24 — Foundational discussion

### User

Requested an AI trading system with broad market analysis and a high level of certainty, then specified multiple platforms, future non-Forex markets, demo accounts, assisted and automatic operation, and scalping over seconds or minutes.

### Assistant

Corrected the objective from certainty to statistical expectancy, drawdown control, validation, and risk management. Proposed the Shadow Market, specialized analytical council, calibrated confidence, multibroker comparison, strategy competition, error memory, and an independent risk engine.

### User and assistant

Defined video learning as Synthetic Experience Memory: it gathers perspectives, questions, methodologies, and contextual judgment without copying or automatically implementing trader strategies.

### User and assistant

Separated Codex as engineer from the application's reasoning layer, fast local engine, deterministic risk authority, and broker adapters. Full risk shutdown is allowed only in demo.

### Naming

AlphaBrain, BrainDriver, Brain, and GreenBrain were rejected for conflicts or weak differentiation. GreenBrain Scalper was selected after a basic public search found no direct trading-product collision.

### Repository and implementation

The user created a private GitHub repository. A secure API key was stored outside GitHub. The assistant delivered the typed core, risk engine, shadow market, deterministic demo feed, decision orchestrator, dashboard prototype, paper broker, execution ledger, duplicate protection, and live-execution block. Seven automated tests and strict TypeScript validation were passing.

## 2026-08-24 — Autonomous development instruction

### User

Directed Codex to build largely autonomously and advance without unnecessary stops.

### Assistant

Accepted autonomous execution within defined safety and authorization boundaries.

## 2026-08-24 — Permanent logging instruction

### User

Requested that every chat message be saved so project context is never lost.

### Assistant

Created permanent project context and conversation log files in the private repository. Secrets and irrelevant personal information are excluded.

## 2026-08-24 — MetaTrader 5 integration discussion requested

### User

Requested a discussion to define how GreenBrain Scalper will integrate with MetaTrader 5.

### Status

Architecture discussion is the next active milestone. No MT5 adapter implementation should begin until runtime placement, data path, execution authority, and disconnect behavior are defined.

## 2026-08-24 — MT5 runtime placement

### User

Confirmed the available personal computer is an Apple Silicon iMac.

### Assistant and decision

Selected a split deployment: the iMac will run the GreenBrain dashboard, configuration, analysis, and supervision, while MetaTrader 5 and the execution bridge will run continuously on a Windows VPS near the broker server. This avoids macOS emulation as an execution dependency and allows operation when the iMac is offline. The first integration remains locked to MT5 demo accounts.

## 2026-08-24 — Existing MT5 demo account

### User

Confirmed that an existing MetaTrader 5 demo account will be used to test GreenBrain, measure its decisions, and improve the system before any future readiness assessment.

### Assistant and decision

GreenBrain will connect to the already-created demo account through the MT5 terminal on Windows. Broker credentials will remain inside MetaTrader 5 and will not be stored by GreenBrain. Experimental improvement will use versioned strategies, recorded decisions, replay, out-of-sample evaluation, and promotion gates based on expectancy, drawdown, profit factor, execution cost, and confidence calibration—not win rate alone. Live-money execution remains disabled.

## 2026-08-24 — Cloud-hosted application requirement

### User

Specified that the completed application must run continuously on internet infrastructure rather than requiring the personal iMac to remain powered on, and must be accessible securely from a phone or any other device at any time.

### Assistant and decision

GreenBrain Scalper will be delivered as a responsive web application/PWA backed by continuously running cloud services. The target production topology separates the internet-facing application and data services from the Windows MT5 execution node. The MT5 node should be placed near the broker server because latency and connection stability matter more than raw compute for scalping. The iMac and phone are clients only; disconnecting them must not stop analysis, demo execution, logging, or safety controls.

## 2026-08-24 — Backend-first autonomous build

### User

Directed Codex to advance as far as possible through the backend and infrastructure before beginning frontend implementation.

### Assistant development outcome

Implemented and pushed the typed MT5 demo adapter boundary, demo account and server allowlisting, heartbeat fail-closed behavior, order preflight contract, duplicate protection, position lifecycle, realized and unrealized P&L, append-only research journal abstraction, and the GreenBrain application service joining assisted/automatic decisions with controlled execution. The dashboard was not modified. Seventeen automated tests and strict TypeScript validation passed locally.

## 2026-08-24 — Core product identity reaffirmed

### User

Clarified before further development that GreenBrain Scalper must be an artificial intelligence specifically built to perform scalping trading, not merely a conventional trading application.

### Assistant and decision

Reaffirmed GreenBrain Scalper as an AI-native scalping system. The AI layer will analyze market context and microstructure, generate and challenge trade hypotheses, estimate calibrated confidence, and learn from versioned experimental evidence. Deterministic services retain final authority over risk, execution, account safety, and demo-only enforcement. A fixed-rule bot or MT5 control panel alone does not satisfy the product requirement.

## 2026-08-24 — Strategy learning and promotion

### User

Required the AI to preserve and improve functions or behaviors that generate profits and progressively establish them as strategies.

### Assistant and decision

Accepted this as a core learning capability with controlled promotion. Profitable behavior is first stored as attributed evidence and a versioned strategy candidate, not immediately activated. Candidates must demonstrate sufficient sample size, positive expectancy after spread/slippage/latency, controlled drawdown, stability across regimes, replay and out-of-sample performance, and independent demo shadow performance. Only candidates passing promotion gates may become active strategies; previous versions remain available for rollback. Losses and rejected trades remain in memory to prevent survivorship bias.
