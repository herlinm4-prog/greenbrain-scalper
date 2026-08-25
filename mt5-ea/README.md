# GreenBrain Expert Advisor (MQL5 push bridge)

Connects a real MT5 terminal - including the macOS build, since the terminal
itself is genuine MT5 under the hood - to the GreenBrain Node service over
HTTP. No Windows, no Python bridge required. This is the Mac-friendly
alternative to `bridge/mt5_bridge.py`.

## How it works

Every `EvaluationIntervalSeconds`, the EA:
1. Reads the current tick and account state.
2. POSTs it to `GreenBrain /api/mt5/evaluate`.
3. GreenBrain runs its full intelligence + deterministic risk pipeline and
   replies with `wait`, or an approved `buy`/`sell` with entry/stop/target
   and a dollar risk amount.
4. If approved and `DryRun=false`, the EA sizes the position itself (from
   MT5's own tick value/size for the symbol) and places the order locally.
5. The EA reports the fill back via `/api/mt5/report-fill`, and later the
   close (stop, target, or manual) via `/api/mt5/report-close`, so
   GreenBrain's memory and dashboard reflect what actually happened in your
   account - not a simulation.

GreenBrain never places an order itself in this mode; it only ever returns
a decision. The EA is what talks to MT5's native trading functions.

## Setup

1. **Start the GreenBrain service** with push mode enabled:
   ```
   GREENBRAIN_MT5_PUSH_LOGIN=<your demo account login> \
   GREENBRAIN_MT5_PUSH_SERVER=<your demo account server, exact broker string> \
   npm start
   ```
   The login/server must match your MT5 account exactly - GreenBrain rejects
   any other account, and separately rejects any account that isn't a demo
   account, regardless of what this EA sends.

2. **Allow the connection in MT5**: Tools > Options > Expert Advisors >
   check "Allow WebRequest for listed URL" > add `http://127.0.0.1:8787`
   (or whatever `ApiBaseUrl` you configure) to the list > OK.

3. **Copy `GreenBrain.mq5`** into your MT5 data folder's `MQL5/Experts/`
   directory (in the terminal: File > Open Data Folder > MQL5 > Experts).

4. **Open it in MetaEditor** (F4 in the terminal, or double-click the file)
   and compile it (F7). I could not compile this myself - MetaEditor only
   runs on Windows/the MT5 terminal itself, not in the environment I write
   code in. If compilation reports an error, paste me the exact message and
   line number and I'll fix it.

5. **Attach it to a single EURUSD chart.** Don't attach it to more than one
   chart - GreenBrain currently trades one symbol and one position at a
   time.

6. **Leave `DryRun=true` for the first session.** Watch the Experts/Journal
   tab and the chart comment. You should see WAIT decisions (and eventually
   a proposed BUY/SELL) without any real order being placed. This confirms
   the connection and the decision pipeline before any money - even demo
   money - moves.

7. Once you've confirmed decisions look reasonable, set `DryRun=false` on
   the EA's inputs to let it place real demo orders.

## Inputs

| Input | Meaning |
|---|---|
| `ApiBaseUrl` | Where the GreenBrain Node service is listening. |
| `TradedSymbol` | Must match GreenBrain's hardcoded symbol (`EURUSD`). |
| `MagicNumber` | Must match on both sides if you ever also run the Python bridge; keeps GreenBrain's orders identifiable. |
| `EvaluationIntervalSeconds` | How often the EA asks GreenBrain for a decision. |
| `MaxLots` | Local hard cap, independent of GreenBrain's own dollar-risk sizing - a second safety net. |
| `DryRun` | true = log decisions only. false = place real (demo) orders. |
| `FillingMode` | If `OrderSend` fails with an unsupported-filling-mode error, switch this to `ORDER_FILLING_IOC`. |

## Known limitations (phase 1 of this integration)

- Single symbol (EURUSD), single open position at a time.
- If the GreenBrain service restarts while a position is open, it loses
  track of that position's original stop-loss for risk-tracking purposes,
  though the close report still updates P/L correctly (see
  `GreenBrainService.reportClose` for the fallback path).
- The EA's JSON handling is hand-written for GreenBrain's specific, flat
  response shapes - not a general-purpose JSON parser.
