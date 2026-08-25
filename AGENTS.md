# GreenBrain — Agent Operating Context

This file is the shared operating context for Codex, Claude Code, and ChatGPT working on this repository.

## Source of truth
- GitHub `main` is the source of truth.
- Before changing code, inspect `main`, recent commits, open PRs, and the files you plan to touch.
- Do not duplicate work already completed by another agent.
- Do not overwrite working MT5 integration, risk controls, or dashboard behavior just to refactor.
- Prefer focused branches/PRs for meaningful changes.
- Run `npm install`, `npm run typecheck`, and `npm test` before merge when TypeScript logic changes.

## Product intent
GreenBrain is not only a dashboard. It is intended to become an always-on trading intelligence that watches markets continuously, evaluates opportunities, learns from historical market structure and its own outcomes, explains decisions in plain language, and makes trading easier for non-expert users while keeping deterministic risk controls around execution.

The commercial UX must remain simple. The user should mainly understand: what GreenBrain sees, what it decided, why, how much is at risk, what is currently happening, and what the session has gained/lost.

## Current architecture
Target data path:

MT5 demo -> local MT5 bridge -> GreenBrain service/core -> `/api/state` -> dashboard

Dashboard controls write back through the GreenBrain API.

The dashboard client polls live state and must not invent/simulate account or trade data when connected to the real service.

## Existing intelligence / controls
Preserve and build on the existing modules for:
- deterministic risk engine
- shadow-market checks
- historical market intelligence / market memory
- knowledge base with source provenance
- GreenBrain chat/advisor architecture
- risk advisor and winning/losing streak review
- dollar-denominated risk limits
- daily loss protection
- profit/session protection
- market-feed watchdog / stale-data blocking
- assisted vs automatic execution
- MT5 demo bridge and HTTP transport
- execution/trading history and experience loop

Development currently remains demo/paper oriented. Do not silently weaken safety boundaries.

## Frontend direction
The interface should feel like a premium financial-intelligence product, not a generic card dashboard and not an old green terminal.

Design goals:
- strong visual hierarchy around WAIT / BUY / SELL
- readable session P&L, risk, account/system state
- visible Market Memory and plain-language reasoning
- restrained semantic green for healthy/positive/live states
- clear amber/red warnings
- premium typography, spacing, depth, responsiveness
- simple operation for a person who does not know trading
- preserve existing DOM IDs when possible because `dashboard/app.js` binds to them

Somnio Software was provided as a quality/style reference: use it as a benchmark for polish, spacing, hierarchy and modern product presentation, not as something to copy.

## Immediate priority: produce a real live dashboard URL
The owner wants a functional live URL, not a GitHub PR link and not a fake localhost link.

There are two layers:
1. Public frontend deployment so the dashboard has a real HTTPS URL.
2. Secure remote telemetry path from that frontend to the GreenBrain service running alongside MT5 on the Mac.

Do NOT expose MT5 directly to the public internet. Prefer a secure authenticated tunnel/proxy from the Mac-side GreenBrain API.

A previous Vercel connector attempt from ChatGPT was blocked by a connector schema mismatch. Vercel account/team exists but had no projects at the time of inspection. Codex should use its terminal/environment and the Vercel CLI or another appropriate deployment mechanism to finish the deployment.

### Codex deployment task
1. Inspect current `main` and open PRs first; reconcile any newer frontend/live-dashboard work before coding.
2. Ensure the dashboard can be served/deployed independently as static assets where appropriate.
3. Deploy a production or preview HTTPS dashboard URL using Vercel (preferred if authenticated in the environment) or another safe host.
4. Verify the URL actually returns the GreenBrain UI before reporting success.
5. For same-Mac live mode, keep the GreenBrain API as the telemetry source.
6. For phone/remote live mode, add a secure authenticated tunnel/proxy architecture; never publish raw MT5 credentials or bridge secrets in frontend code.
7. Document the exact final URL and the remaining step, if any, required on the Mac to stream real MT5 telemetry into the remote dashboard.

## Coordination rule
After any significant Codex or Claude Code change, leave a concise commit/PR description so the other agents can inspect what changed before doing new work.
