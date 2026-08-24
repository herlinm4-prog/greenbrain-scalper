# GreenBrain Scalper — Frontend Functional Audit

## Product rule

The web application is an operational surface, not a decorative analytics dashboard. Every status must come from backend evidence, every dangerous action must show its scope and confirmation state, and no optimistic UI may imply that an order or safety change succeeded before authoritative confirmation.

## Navigation architecture

### Command

- Current market and session.
- Freshness, spread, latency, and connection state.
- Current AI action including abstention.
- Confidence, Shadow Market survival, council agreement, and regime.
- Demo equity, P&L in currency and R, open risk, and risk-authority state.
- Decision stream including trades, rejections, observations, and incidents.
- Assisted versus Automatic Demo control.
- Emergency stop with persistent system feedback.

### Markets

- Watchlist and instrument eligibility.
- Bid, ask, spread, regime, volatility, and confidence.
- Data-quality state and stale-feed warnings.
- Session and broker-symbol mapping.
- Instrument-level spread and risk constraints.

### Strategies

- Observation, hypothesis, candidate, shadow, validated, active, degraded, and retired states.
- Version, lineage, probability of edge, expectancy, drawdown, and applicable regimes.
- Supporting and contradicting evidence.
- Promotion, pause, rollback, and export controls with authorization.

### Research

- Continuous intelligence inbox.
- Source provenance and credibility tier.
- Anomalies, hypotheses, contradictions, required tests, and rejected claims.
- Research briefs and links to generated strategy candidates.

### Journal

- Decisions, no-trades, orders, fills, positions, incidents, and system changes.
- Filtering by date, instrument, strategy, regime, outcome, and event type.
- Evidence details and export.
- Immutable audit identity and sequence.

### Risk

- Risk per trade, daily/weekly loss, drawdown, exposure, positions, spread, slippage, latency, and margin limits.
- Broker and instrument overrides.
- Demo-only full risk shutdown clearly separated from future live safety floors.
- Emergency behavior and restart requirements.

### Connections

- MT5 account, server, demo verification, heartbeat, terminal, and latency.
- Reconnection, reconciliation, clock synchronization, and incident history.
- Future broker adapters and data providers.

### System

- Health of AI, risk, execution, broker, journal, research, notifications, and database services.
- Action Registry and Product Audit access.
- Deployment version, incidents, queues, costs, and recovery status.

### GreenBrain chat

- Accessible from every area without covering essential emergency controls.
- Explains decisions, strategies, research, risk, and incidents.
- Can draft reports and propose allowlisted actions.
- Commands are structured, expiring, auditable, and require confirmation.
- Cannot directly place orders or bypass risk.

## Responsive requirements

- Desktop sidebar for Mac and larger displays.
- Bottom navigation for phones.
- Touch-safe targets and no hover-only actions.
- Critical state visible without horizontal scrolling.
- Chat drawer sized for phone and desktop.
- Emergency state remains visible after navigation.

## States still required before production frontend

- Loading and delayed-data states.
- Empty strategy/research/journal states.
- Offline and partial-service failure states.
- Permission denied and step-up authentication states.
- Command confirmation, expiration, cancellation, and failure states.
- Partial fills and reconciliation conflicts.
- Accessible keyboard focus and screen-reader announcements.
- Real backend integration; current checkpoint uses representative demo data.

