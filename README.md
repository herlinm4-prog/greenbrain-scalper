# GreenBrain

GreenBrain is an automated trading intelligence designed to make market monitoring, risk control, execution, learning, and explanation understandable to people who do not live inside trading terminals.

The product principle is simple: **complex intelligence underneath, simple decisions for the customer**.

## What GreenBrain is becoming

GreenBrain continuously watches markets, builds historical context, detects opportunities, applies deterministic risk rules, stress-tests proposed trades, records outcomes, learns from experience, and explains what it sees in plain language.

The commercial dashboard deliberately exposes only the controls a customer should need:

- money at risk per trade;
- Safe / Balanced / Aggressive operating style;
- daily profit goal;
- daily loss limit;
- automation Start / Stop;
- Emergency Stop;
- profit, loss, streak, and opportunity alerts;
- trading history and GreenBrain explanations.

Lot sizes, broker mechanics, stop calculations, execution checks, market-memory calculations, and strategy attribution remain internal.

## Intelligence architecture

1. **Live Market Feed** normalizes broker quotes.
2. **Market Memory** compares the current market with historical highs, lows, range position, volatility, support/resistance, and trend.
3. **Signal Intelligence** forms BUY / SELL / WAIT hypotheses with confidence and rationale.
4. **Knowledge Base** stores provenance-aware knowledge from approved books, research, web sources, broker material, and internal observations. External information is context, never a direct execution instruction.
5. **Risk Engine** sizes or rejects exposure according to hard policy limits.
6. **Historical Context Gate** can reject a technically valid signal when it conflicts with the broader market structure.
7. **Shadow Market** stress-tests approved proposals against spread and slippage scenarios.
8. **Execution Service / MT5 Bridge** translates approved demo orders to the trading platform.
9. **Experience Loop** records net P/L, costs, R-multiple, capture efficiency, protected-capital events, and missed opportunities.
10. **Pattern Discovery** promotes repeated observations into hypotheses and strategy candidates only after evidence accumulates.
11. **Risk Advisor** watches winning and losing streaks. It may recommend reviewing risk, but increases require user confirmation and remain capped.
12. **GreenBrain Advisor** explains market structure and decisions in plain language.

## Safety boundary

- Demo and paper accounts remain the development boundary.
- AI reasoning never calls a broker directly.
- Every automated trade passes deterministic risk controls.
- Daily loss limits and emergency stops override intelligence signals.
- A winning streak does not automatically justify more risk.
- External knowledge must retain source provenance and confidence.
- No profitability is assumed from a small number of trades.

## Quality gates

The repository includes automated tests for risk, execution, MT5 transport, trading journal, strategy learning, experience attribution, historical market intelligence, knowledge provenance, and streak-aware risk advice.

Pull requests run:

```bash
npm install
npm run typecheck
npm test
```

## Local development

```bash
npm install
npm test
npm run typecheck
```

The owner dashboard is deployed at [greenbrain-scalper.herlingym.chatgpt.site](https://greenbrain-scalper.herlingym.chatgpt.site). It displays no operational value unless it came from an authenticated GreenBrain API response.

The Mac launcher `start-greenbrain.command` now starts GreenBrain Core and its local same-origin dashboard together at `http://127.0.0.1:8787`. For remote dashboard access, put an authenticated HTTPS tunnel or reverse proxy in front of the loopback service and configure:

```bash
GREENBRAIN_API_TOKEN=<long-random-token>
GREENBRAIN_DASHBOARD_ORIGIN=https://greenbrain-scalper.herlingym.chatgpt.site
```

Enter the HTTPS endpoint and the same token in the dashboard's **Connections** area. The endpoint is retained on the device; the token is retained only for the active browser session. See `docs/LIVE_DASHBOARD.md` for the exact boundary.

GreenBrain is trading software and trading involves risk. It does not guarantee profits.
