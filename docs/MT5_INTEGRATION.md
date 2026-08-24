# MetaTrader 5 Demo Integration

## Deployment boundary

GreenBrain Core and the future web API run as cloud services. MetaTrader 5 and the GreenBrain MT5 Bridge run on a dedicated Windows VPS near the broker server. Phones and personal computers are clients only.

## Mandatory demo safeguards

- Reject every account whose MT5 trade mode is not `demo`.
- Require an exact allowlisted account login and server name.
- Attach a dedicated GreenBrain magic number to every request.
- Run `order_check` before `order_send`.
- Reject reused universal order IDs.
- Block new orders after heartbeat expiration.
- Keep stop-loss and take-profit values in the broker request.
- Never store the MT5 password in GreenBrain.

## Connection lifecycle

1. The account owner signs in to the existing demo account inside MT5.
2. The bridge initializes the official MT5 connection locally on Windows.
3. GreenBrain verifies trade mode, login, server, and heartbeat.
4. Ticks and account state are normalized into universal domain models.
5. A strategy proposes an action; deterministic confidence, risk, and Shadow Market checks run.
6. The bridge performs MT5 preflight validation and then submits the demo order.
7. Receipts, positions, P&L, rejections, and connection events enter the trading journal.

## Fail-closed behavior

When the bridge heartbeat expires, the account identity changes, the returned quote is invalid, or the cloud control path is unavailable, GreenBrain blocks new orders. Existing broker-hosted protective stops remain in MT5. Automatic reconnection must re-run the full account allowlist check before order submission resumes.

## Promotion rule

Demo results do not authorize live trading. Strategy candidates must remain versioned and must pass replay, out-of-sample, execution-cost, drawdown, expectancy, and confidence-calibration gates. Win rate alone is not a promotion metric.

## Implemented physical bridge

The repository now includes `bridge/mt5_bridge.py`, a Windows-local FastAPI service using MetaQuotes' official Python package, and `Mt5HttpTransport`, the TypeScript cloud-side client.

The bridge exposes authenticated HTTPS contracts for account identity, heartbeat, symbol ticks, `order_check`, and `order_send`. It reads the account already signed into the terminal and never receives the MT5 password. A local SQLite idempotency ledger blocks repeated universal order IDs across process restarts.

Before the first demo test, the account owner must provide only the MT5 demo login number and exact demo server name for the allowlist, then run the bridge beside the signed-in Windows MT5 terminal. The bridge token must be generated independently and stored as a server secret, never pasted into source control.

Physical validation remains incomplete until the Windows node is available. Required acceptance evidence is: verified demo trade mode, matching login/server, fresh tick stream, successful dry preflight, one minimum-size order with broker-hosted stop-loss/take-profit, receipt reconciliation, forced-disconnect fail-closed behavior, and duplicate replay rejection.
