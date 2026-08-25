# GreenBrain live dashboard handoff

## Verified dashboard

The owner dashboard is deployed at:

`https://greenbrain-scalper.herlingym.chatgpt.site`

The interface begins disconnected by design. It does not claim that MT5, a market feed, an account balance, a strategy result, or automation is active until GreenBrain Core returns authoritative state.

## Local same-Mac mode

Double-click `start-greenbrain.command`. It installs dependencies on the first launch, starts GreenBrain Core, serves the repository dashboard and opens:

`http://127.0.0.1:8787`

Without MT5 configuration, GreenBrain clearly identifies the built-in paper engine. This mode is useful for service and dashboard validation but is not physical MT5 evidence.

## MT5 demo push mode

Start GreenBrain with the exact demo login/server allowlist, a long random API token, and the hosted dashboard origin:

```bash
GREENBRAIN_MT5_PUSH_LOGIN=<demo-login> \
GREENBRAIN_MT5_PUSH_SERVER=<exact-demo-server> \
GREENBRAIN_API_TOKEN=<long-random-token> \
GREENBRAIN_DASHBOARD_ORIGIN=https://greenbrain-scalper.herlingym.chatgpt.site \
npm start
```

Set the EA's `ApiToken` input to the same token. Keep `DryRun=true` for the first physical verification session.

## Remote phone/browser mode

1. Keep GreenBrain bound to loopback; do not publish MT5 or its credentials.
2. Put a trusted authenticated HTTPS tunnel or reverse proxy in front of `127.0.0.1:8787`.
3. In the hosted dashboard, open **Connections**.
4. Enter the HTTPS endpoint and API token.
5. The dashboard polls every 1.5 seconds and marks the connection offline when requests fail.

The endpoint is stored in device-local browser storage. The access token is stored only in session storage and is cleared when the browser session ends or the user disconnects.

## Remaining physical acceptance evidence

- MT5 reports a demo account matching the allowlisted login and server.
- The dashboard identifies `MT5 PUSH · DEMO` or `MT5 BRIDGE · DEMO`, not `PAPER ENGINE`.
- Feed age remains fresh and EURUSD bid/ask update from MT5.
- A dry-run BUY/SELL decision is received without placing an order.
- One minimum-size demo order is reconciled with fill, protective stops and close result.
- Disconnect, stale feed, wrong token, wrong account and duplicate decision tests fail closed.

Until that evidence is captured, the dashboard is live and operationally connected, but the MT5 physical integration is not considered verified.
