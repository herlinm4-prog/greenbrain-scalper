# GreenBrain Scalper — Critical Product Audit

Date: 2026-08-24

## Audit conclusion

The repository has a sound separation between AI proposals, deterministic risk, execution, MT5 transport, research memory, and strategy validation. It is still a research backend, not a deployable trading product. The highest remaining risks are Forex-aware position sizing, transactional persistence, real MT5 recovery behavior, authenticated cloud control, market-data quality, and leakage-safe model evaluation.

## Corrected during this audit

### A-001 — Stale assisted approval could execute

- Severity: Critical
- Problem: assisted confirmation accepted a previously approved decision without rechecking the current market, account, spread, and policy.
- Correction: confirmation now performs a fresh deterministic evaluation and records that evaluation before execution.
- Verification: automated regression test added.

### A-002 — Decision journal prevented legitimate reevaluation

- Severity: High
- Problem: one decision event ID per signal prevented recording the same proposal evaluated at a later market time.
- Correction: decision identity now includes evaluation timestamp while exact duplicate events remain blocked.

### A-003 — Chat commands lacked a formal safety boundary

- Severity: Critical
- Problem: a conversational agent could eventually be wired directly to operational actions.
- Correction: chat output may only create allowlisted, expiring command proposals. Every operational proposal remains pending until explicit confirmation. Direct order execution and risk bypass are not chat commands.

### A-004 — New ideas had no testable lifecycle

- Severity: High
- Problem: requirements could be discussed and logged without acceptance criteria or delivery status.
- Correction: added a typed Project Registry covering ideas, requirements, defects, actions, decisions, priority, state, source, relationships, and acceptance criteria.

## Open critical and high-priority findings

### A-005 — Forex sizing is not production-correct

- Severity: Critical
- Current risk sizing assumes price distance maps directly to account-currency loss.
- Required: instrument contract size, tick size/value, quote-to-account conversion, broker volume minimum/maximum/step, margin estimate, and rounding-loss validation.
- Constraint: block physical MT5 order submission until completed and tested with actual symbol specifications.

### A-006 — Persistence is not durable or transactional

- Severity: Critical
- Current journal store is in memory.
- Required: PostgreSQL event store, unique idempotency constraints, transactions joining intent/order/receipt/position updates, migrations, backups, retention, and replay recovery.

### A-007 — MT5 recovery is incomplete

- Severity: Critical
- Required: account identity revalidation after reconnect, open-order/position reconciliation, terminal restart recovery, broker ticket persistence, partial fills, cancel/close/modify support, symbol mapping, market-closed handling, and clock-drift checks.

### A-008 — Cloud control plane is not authenticated

- Severity: Critical
- Required: secure sessions, MFA, role-based permissions, step-up confirmation, CSRF protection, rate limiting, audit trails, session revocation, and encrypted service-to-service authentication.

### A-009 — Emergency behavior is not end-to-end

- Severity: Critical
- Required: pause new analysis, cancel pending intents, optionally close demo positions under explicit policy, preserve broker stops, test network partitions, and expose immutable audit evidence.

### A-010 — Market-data integrity is incomplete

- Severity: High
- Required: stale-tick detection, sequence gaps, outliers, bid/ask inversion, session state, broker time normalization, duplicate ticks, depth availability, and independent reference comparison.

### A-011 — Strategy research can still suffer leakage

- Severity: High
- Required: immutable train/validation/test partitions, purged walk-forward validation, embargo windows, feature timestamp provenance, multiple-testing accounting, strategy lineage, and reproducible datasets.

### A-012 — Continuous internet research is not implemented

- Severity: High
- Required: allowlisted sources, provenance, scheduling, deduplication, claim extraction, contradiction mapping, prompt-injection isolation, licensing controls, and conversion to non-executable hypotheses.

### A-013 — AI chat provider adapter is pending

- Severity: High
- Current typed boundary is implemented and a dedicated project key is stored outside GitHub.
- Required: server-side Responses API adapter, structured output validation, conversation persistence, token/cost controls, moderation, timeouts, retry policy, and model-evaluation tests.

## Required functional areas before frontend completion

1. Identity, authentication, sessions, and permissions.
2. Account and broker connection management.
3. Live market state and data-quality status.
4. AI analysis with calibrated uncertainty and abstention.
5. Deterministic risk profiles and emergency controls.
6. Assisted and automatic demo workflows.
7. Orders, fills, partial fills, positions, and P&L.
8. Strategy discovery, attribution, validation, promotion, degradation, and rollback.
9. Research ingestion, anomalies, hypotheses, citations, and discovery briefs.
10. Strategy document compilation and export.
11. GreenBrain conversational assistant with confirmed command proposals.
12. Notifications, incidents, reconnects, and recovery.
13. Audit logs, observability, performance, and cost monitoring.
14. Responsive web/PWA experience for Mac and mobile.

## Release gates

- No real-money execution.
- No MT5 physical execution before correct instrument-aware sizing.
- No cloud deployment before authentication and service identity.
- No strategy promotion without untouched out-of-sample evidence.
- No chat command may bypass confirmation, risk, or execution boundaries.
- No frontend control may imply an action succeeded before backend confirmation.

