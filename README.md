# GreenBrain Scalper

AI-assisted, multimarket scalping research platform. The project starts with simulated Forex execution and is designed to add broker adapters without coupling the decision engine to a specific provider.

## Safety boundary

- Demo and paper accounts only during development.
- No live-money credentials or execution paths.
- Every automated trade must pass a deterministic risk engine.
- Disabling risk controls is permitted only in demo mode.
- AI proposals never call a broker directly.

## Initial architecture

1. `MarketSnapshot` normalizes quotes from every broker.
2. `SignalProposal` represents an analytical hypothesis.
3. `RiskEngine` approves, resizes, or rejects that proposal.
4. `ShadowMarket` stress-tests approved proposals against spread and slippage scenarios.
5. Broker adapters will translate approved universal orders into platform-specific demo orders.

## Current milestone

The first commit establishes the domain model, deterministic risk boundary, shadow-market simulation, and automated tests. Broker connectivity and the AI reasoning layer will be added behind these interfaces.

## Local development

```bash
npm install
npm test
npm run typecheck
```

This software is for research and simulation. It does not promise profitability or provide financial advice.
