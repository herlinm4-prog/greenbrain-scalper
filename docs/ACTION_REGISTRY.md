# GreenBrain Scalper — Action Registry

This registry is the operational source of truth for product ideas, defects, requirements, and implementation actions. Every new substantive idea must be added with acceptance criteria and linked to code, tests, or a decision before it can be marked verified.

| ID | Priority | Type | Status | Action |
|---|---|---|---|---|
| GB-001 | Critical | Requirement | Verified | Enforce demo-only broker execution |
| GB-002 | Critical | Requirement | Verified | Keep deterministic risk authority separate from AI |
| GB-003 | Critical | Defect | Verified | Reevaluate assisted decisions at confirmation time |
| GB-004 | Critical | Requirement | In progress | Implement instrument-aware Forex position sizing |
| GB-005 | Critical | Action | In progress | Add PostgreSQL transactional event persistence |
| GB-006 | Critical | Action | Planned | Implement complete MT5 reconciliation and restart recovery |
| GB-007 | Critical | Action | Planned | Add authenticated cloud control plane and MFA |
| GB-008 | Critical | Requirement | In progress | Complete end-to-end emergency-stop behavior |
| GB-009 | High | Requirement | Verified | Attribute luck versus repeatable strategy edge |
| GB-010 | High | Requirement | Verified | Generate versioned strategy research documents |
| GB-011 | High | Requirement | Verified | Keep anomalies separate from reproducible patterns |
| GB-012 | High | Requirement | Planned | Implement continuous market-intelligence research |
| GB-013 | High | Requirement | In progress | Add GreenBrain conversational assistant |
| GB-014 | High | Requirement | Verified | Require confirmation for chat-proposed operational commands |
| GB-015 | High | Requirement | Verified | Capture every new idea with acceptance criteria and status |
| GB-016 | High | Action | Planned | Add market-data integrity and stale-feed controls |
| GB-017 | High | Action | Planned | Add leakage-safe datasets and purged walk-forward validation |
| GB-018 | High | Action | Planned | Add notifications, incidents, and reconnect reporting |
| GB-019 | Medium | Requirement | Planned | Build responsive web/PWA for Mac and mobile |
| GB-020 | Medium | Requirement | Planned | Export a complete user strategy compilation |

## Acceptance criteria for current in-progress work

### GB-004 — Instrument-aware sizing

- Uses broker symbol specification and account currency.
- Honors volume min/max/step.
- Calculates maximum loss at stop after rounding.
- Rejects missing or inconsistent conversion data.
- Includes EUR/USD, USD/JPY, and GBP/USD tests.

### GB-008 — Emergency stop

- Blocks all new intents immediately.
- Creates an audit event.
- Persists across service restart.
- Defines explicit demo-position handling.
- Works during partial service degradation.

### GB-005 — PostgreSQL persistence

- Core schema migration is versioned and reversible.
- Journal writes enforce unique event identities.
- Multi-event writes are atomic.
- Service restart can replay events in sequence.
- Production adapter passes integration tests against PostgreSQL.
- Backup, restore, retention, and migration procedures are verified.

### GB-013 — GreenBrain chat

- Uses a server-side provider key only.
- Answers questions about decisions, strategies, and research.
- Produces structured, allowlisted command proposals.
- Requires explicit confirmation for operational commands.
- Cannot place orders, disable risk, or claim an action completed without backend evidence.
- Persists conversation and action audit history.
