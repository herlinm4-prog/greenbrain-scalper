//+------------------------------------------------------------------+
//| GreenBrain.mq5                                                    |
//|                                                                    |
//| Bridges a real MT5 terminal (including the macOS build - the      |
//| terminal itself is genuine MT5, WebRequest works the same way) to |
//| the GreenBrain Node service over HTTP. This EA never decides on   |
//| its own: every evaluation is delegated to GreenBrain's            |
//| /api/mt5/evaluate endpoint, which runs the same intelligence and  |
//| deterministic risk pipeline used in paper/demo mode. This EA only |
//| does local MT5-native lot sizing and order placement, then        |
//| reports back what actually happened so GreenBrain's memory        |
//| reflects real trades, not a simulation.                           |
//|                                                                    |
//| SAFETY:                                                            |
//| - DryRun defaults to true: decisions are logged but no real order |
//|   is ever sent until you explicitly set DryRun=false.             |
//| - GreenBrain's server side independently rejects any account that |
//|   does not match its configured allowlist login/server, and any   |
//|   account whose trade mode is not "demo" - this EA cannot bypass  |
//|   that even if misconfigured.                                     |
//| - Only ever manages one open position at a time (by design, to    |
//|   match GreenBrain's current risk model).                         |
//|                                                                    |
//| SETUP (one-time, in the terminal, not in code):                   |
//| 1. Tools > Options > Expert Advisors > check "Allow WebRequest    |
//|    for listed URL" and add ApiBaseUrl exactly (e.g.               |
//|    http://127.0.0.1:8787) to the allowed list.                    |
//| 2. Attach this EA to a single EURUSD chart. Do not attach it to   |
//|    more than one chart - GreenBrain currently only trades one     |
//|    symbol and one position at a time.                             |
//| 3. Leave DryRun=true for the first session and just watch the     |
//|    Experts/Journal log and the chart comment to confirm the       |
//|    connection and decisions look right before flipping it off.    |
//+------------------------------------------------------------------+
#property copyright "GreenBrain"
#property version   "1.00"
#property strict

input string ApiBaseUrl               = "http://127.0.0.1:8787"; // must match GREENBRAIN_API_PORT on the Node side
input string ApiToken                 = "";                       // must match GREENBRAIN_API_TOKEN when API protection is enabled
input string TradedSymbol             = "EURUSD";                 // must match GreenBrain's hardcoded symbol
input int    MagicNumber              = 260824;
input int    EvaluationIntervalSeconds = 2;
input double MaxLots                  = 0.10;                     // local hard cap, independent of GreenBrain's own risk math
input bool   DryRun                   = true;                     // true: log decisions only, never place real orders
input int    HttpTimeoutMs            = 4000;
input ENUM_ORDER_TYPE_FILLING FillingMode = ORDER_FILLING_FOK;    // if OrderSend fails with "unsupported filling mode", try ORDER_FILLING_IOC

ulong    g_openTicket      = 0;
long     g_openPositionId  = 0;
string   g_openDecisionId  = "";
datetime g_historyFromTime = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   if(TradedSymbol != _Symbol)
      Print("GreenBrain WARNING: EA is attached to ", _Symbol, " but TradedSymbol input is ", TradedSymbol, ". Attach it to the matching chart.");

   g_historyFromTime = TimeCurrent() - 60;
   EventSetTimer(EvaluationIntervalSeconds);
   Print("GreenBrain EA initialized. DryRun=", (DryRun ? "true (no real orders)" : "false (LIVE demo orders)"), " ApiBaseUrl=", ApiBaseUrl);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

//+------------------------------------------------------------------+
void OnTimer()
{
   CheckForClosedPosition();
   if(g_openTicket != 0) return; // already managing one position; wait for it to close

   MqlTick tick;
   if(!SymbolInfoTick(TradedSymbol, tick))
   {
      Print("GreenBrain: no tick available for ", TradedSymbol);
      return;
   }

   string body = BuildEvaluateBody(tick);
   string response;
   int status = HttpPost("/api/mt5/evaluate", body, response);
   if(status != 200)
   {
      Print("GreenBrain: evaluate call failed (HTTP ", status, "): ", response);
      Comment("GreenBrain: connection problem (HTTP ", status, ")");
      return;
   }

   string action     = JsonGetString(response, "action");
   string decisionId = JsonGetString(response, "decisionId");
   string reason      = JsonGetString(response, "reason");
   double confidence  = JsonGetDouble(response, "confidencePct");

   if(action == "wait" || action == "")
   {
      Comment("GreenBrain: WAIT (", confidence, "%) - ", reason);
      return;
   }

   double stopLoss   = JsonGetDouble(response, "stopLoss");
   double takeProfit = JsonGetDouble(response, "takeProfit");
   double riskAmount = JsonGetDouble(response, "riskAmount");

   Comment("GreenBrain: ", action, " proposed (", confidence, "%) - ", reason);
   Print("GreenBrain decision ", decisionId, ": ", action, " sl=", stopLoss, " tp=", takeProfit, " risk=$", riskAmount);

   if(DryRun)
   {
      Print("GreenBrain: DryRun is ON - not placing a real order.");
      return;
   }

   PlaceOrder(action, stopLoss, takeProfit, riskAmount, decisionId, tick);
}

//+------------------------------------------------------------------+
//| Build the JSON body for POST /api/mt5/evaluate                    |
//+------------------------------------------------------------------+
string BuildEvaluateBody(const MqlTick &tick)
{
   long login          = AccountInfoInteger(ACCOUNT_LOGIN);
   string server        = AccountInfoString(ACCOUNT_SERVER);
   string tradeMode     = AccountTradeModeString();
   double equity        = AccountInfoDouble(ACCOUNT_EQUITY);
   double balance       = AccountInfoDouble(ACCOUNT_BALANCE);
   int openPositions    = CountOwnOpenPositions();
   long timestampMs     = (long)tick.time_msc;
   if(timestampMs <= 0) timestampMs = (long)TimeCurrent() * 1000;

   string json = "{";
   json += "\"accountLogin\":" + IntegerToString(login) + ",";
   json += "\"accountServer\":\"" + JsonEscape(server) + "\",";
   json += "\"accountTradeMode\":\"" + tradeMode + "\",";
   json += "\"symbol\":\"" + TradedSymbol + "\",";
   json += "\"bid\":" + DoubleToString(tick.bid, _Digits) + ",";
   json += "\"ask\":" + DoubleToString(tick.ask, _Digits) + ",";
   json += "\"timestampMs\":" + IntegerToString(timestampMs) + ",";
   json += "\"equity\":" + DoubleToString(equity, 2) + ",";
   json += "\"balance\":" + DoubleToString(balance, 2) + ",";
   json += "\"openPositions\":" + IntegerToString(openPositions);
   json += "}";
   return json;
}

string AccountTradeModeString()
{
   long mode = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   if(mode == ACCOUNT_TRADE_MODE_DEMO) return "demo";
   if(mode == ACCOUNT_TRADE_MODE_CONTEST) return "contest";
   return "real";
}

int CountOwnOpenPositions()
{
   int count = 0;
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      if(PositionGetString(POSITION_SYMBOL) != TradedSymbol) continue;
      count++;
   }
   return count;
}

//+------------------------------------------------------------------+
//| Size the position locally from GreenBrain's dollar risk amount    |
//| and stop distance, using MT5's own tick value/size for this       |
//| symbol - the standard MQL5 approach for converting dollar risk    |
//| into a broker-correct lot size.                                   |
//+------------------------------------------------------------------+
double LotsForRisk(double riskAmount, double entryPrice, double stopLoss)
{
   double tickValue = SymbolInfoDouble(TradedSymbol, SYMBOL_TRADE_TICK_VALUE);
   double tickSize  = SymbolInfoDouble(TradedSymbol, SYMBOL_TRADE_TICK_SIZE);
   double volMin    = SymbolInfoDouble(TradedSymbol, SYMBOL_VOLUME_MIN);
   double volMax    = SymbolInfoDouble(TradedSymbol, SYMBOL_VOLUME_MAX);
   double volStep   = SymbolInfoDouble(TradedSymbol, SYMBOL_VOLUME_STEP);

   double stopDistance = MathAbs(entryPrice - stopLoss);
   if(stopDistance <= 0 || tickValue <= 0 || tickSize <= 0)
   {
      Print("GreenBrain: cannot size position - invalid symbol tick/stop values");
      return 0;
   }

   double lossPerLot = (stopDistance / tickSize) * tickValue;
   if(lossPerLot <= 0) return 0;

   double rawLots = riskAmount / lossPerLot;
   double steppedLots = MathFloor(rawLots / volStep) * volStep;
   double cappedLots = MathMin(steppedLots, MathMin(MaxLots, volMax));
   if(cappedLots < volMin) return 0; // risk budget too small for this broker's minimum lot

   return NormalizeDouble(cappedLots, 2);
}

//+------------------------------------------------------------------+
void PlaceOrder(string action, double stopLoss, double takeProfit, double riskAmount, string decisionId, const MqlTick &tick)
{
   double entryPrice = (action == "buy") ? tick.ask : tick.bid;
   double lots = LotsForRisk(riskAmount, entryPrice, stopLoss);
   if(lots <= 0)
   {
      Print("GreenBrain: computed lot size is zero, skipping this decision (", decisionId, ")");
      ReportFill(decisionId, "rejected", action, 0, 0, 0, 0, "Computed lot size was zero");
      return;
   }

   MqlTradeRequest request;
   MqlTradeResult  result;
   ZeroMemory(request);
   ZeroMemory(result);

   request.action       = TRADE_ACTION_DEAL;
   request.symbol       = TradedSymbol;
   request.volume       = lots;
   request.type         = (action == "buy") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   request.price        = entryPrice;
   request.sl            = stopLoss;
   request.tp            = takeProfit;
   request.deviation    = 20;
   request.magic         = MagicNumber;
   request.comment       = "GreenBrain " + decisionId;
   request.type_filling = FillingMode;

   bool sent = OrderSend(request, result);
   if(!sent || result.retcode != TRADE_RETCODE_DONE)
   {
      Print("GreenBrain: OrderSend failed. retcode=", result.retcode, " comment=", result.comment,
            " - if this says the filling mode is unsupported, change the FillingMode input to ORDER_FILLING_IOC.");
      ReportFill(decisionId, "rejected", action, 0, 0, 0, 0, "OrderSend retcode " + IntegerToString(result.retcode) + ": " + result.comment);
      return;
   }

   // Find the resulting position (we use a unique magic number and manage
   // only one position at a time, so this is unambiguous).
   ulong newTicket = 0;
   for(int i = 0; i < PositionsTotal(); i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      if(PositionGetString(POSITION_SYMBOL) != TradedSymbol) continue;
      newTicket = ticket;
      break;
   }

   if(newTicket == 0)
   {
      Print("GreenBrain: order reported success but no matching position was found - reporting fill from the trade result instead.");
   }

   double filledPrice = (newTicket != 0) ? PositionGetDouble(POSITION_PRICE_OPEN) : result.price;
   double filledVolume = (newTicket != 0) ? PositionGetDouble(POSITION_VOLUME) : lots;

   g_openTicket     = (newTicket != 0) ? newTicket : result.order;
   g_openPositionId = (newTicket != 0) ? (long)PositionGetInteger(POSITION_IDENTIFIER) : 0;
   g_openDecisionId = decisionId;

   Print("GreenBrain: order filled. ticket=", g_openTicket, " volume=", filledVolume, " price=", filledPrice);
   ReportFill(decisionId, "filled", action, g_openTicket, filledPrice, stopLoss, takeProfit, filledVolume);
}

void ReportFill(string decisionId, string status, string side, ulong ticket, double entryPrice, double stopLoss, double takeProfit, double volumeLots)
{
   string json = "{";
   json += "\"decisionId\":\"" + JsonEscape(decisionId) + "\",";
   json += "\"status\":\"" + status + "\",";
   json += "\"symbol\":\"" + TradedSymbol + "\",";
   json += "\"side\":\"" + side + "\",";
   if(status == "filled")
   {
      json += "\"ticket\":" + IntegerToString((long)ticket) + ",";
      json += "\"entryPrice\":" + DoubleToString(entryPrice, _Digits) + ",";
      json += "\"stopLoss\":" + DoubleToString(stopLoss, _Digits) + ",";
      json += "\"takeProfit\":" + DoubleToString(takeProfit, _Digits) + ",";
      json += "\"volumeLots\":" + DoubleToString(volumeLots, 2) + ",";
   }
   json += "\"timestampMs\":" + IntegerToString((long)TimeCurrent() * 1000);
   json += "}";

   string response;
   int status_code = HttpPost("/api/mt5/report-fill", json, response);
   if(status_code != 200) Print("GreenBrain: report-fill call failed (HTTP ", status_code, "): ", response);
}

//+------------------------------------------------------------------+
//| Detect that our tracked position has closed (stop, target, or     |
//| manual) and report the realized outcome back to GreenBrain.       |
//+------------------------------------------------------------------+
void CheckForClosedPosition()
{
   if(g_openTicket == 0) return;
   if(PositionSelectByTicket(g_openTicket)) return; // still open

   double exitPrice = 0, realizedPnl = 0;
   datetime closedAt = TimeCurrent();
   if(FindClosingDeal(g_openPositionId, exitPrice, realizedPnl, closedAt))
   {
      Print("GreenBrain: position ", g_openTicket, " closed. exit=", exitPrice, " pnl=", realizedPnl);
      ReportClose(g_openTicket, closedAt, exitPrice, realizedPnl);
   }
   else
   {
      Print("GreenBrain WARNING: position ", g_openTicket, " is no longer open but its closing deal was not found in history.");
   }

   g_openTicket = 0;
   g_openPositionId = 0;
   g_openDecisionId = "";
}

bool FindClosingDeal(long positionId, double &exitPrice, double &realizedPnl, datetime &closedAt)
{
   if(!HistorySelect(g_historyFromTime, TimeCurrent() + 60)) return false;
   int total = HistoryDealsTotal();
   for(int i = total - 1; i >= 0; i--)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket == 0) continue;
      if((long)HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID) != positionId) continue;
      if((ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY) != DEAL_ENTRY_OUT) continue;

      exitPrice   = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      double profit     = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double swap       = HistoryDealGetDouble(dealTicket, DEAL_SWAP);
      double commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      realizedPnl = profit + swap + commission;
      closedAt    = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      return true;
   }
   return false;
}

void ReportClose(ulong ticket, datetime closedAt, double exitPrice, double realizedPnl)
{
   string json = "{";
   json += "\"ticket\":" + IntegerToString((long)ticket) + ",";
   json += "\"closedAtMs\":" + IntegerToString((long)closedAt * 1000) + ",";
   json += "\"exitPrice\":" + DoubleToString(exitPrice, _Digits) + ",";
   json += "\"realizedPnl\":" + DoubleToString(realizedPnl, 2);
   json += "}";

   string response;
   int status_code = HttpPost("/api/mt5/report-close", json, response);
   if(status_code != 200) Print("GreenBrain: report-close call failed (HTTP ", status_code, "): ", response);
}

//+------------------------------------------------------------------+
//| Minimal HTTP + JSON helpers                                       |
//| MQL5 has no built-in JSON library and WebRequest works on byte    |
//| arrays, so these are hand-rolled for GreenBrain's specific, flat  |
//| (non-nested) JSON shapes only - not a general-purpose parser.     |
//+------------------------------------------------------------------+
int HttpPost(string path, string jsonBody, string &responseOut)
{
   string url = ApiBaseUrl + path;
   string headers = "Content-Type: application/json\r\n";
   if(StringLen(ApiToken) > 0)
      headers += "Authorization: Bearer " + ApiToken + "\r\n";
   char requestData[];
   StringToCharArray(jsonBody, requestData, 0, StringLen(jsonBody));
   char resultData[];
   string resultHeaders;

   ResetLastError();
   int status = WebRequest("POST", url, headers, HttpTimeoutMs, requestData, resultData, resultHeaders);
   if(status == -1)
   {
      int err = GetLastError();
      responseOut = "WebRequest error " + IntegerToString(err) +
                    " - check Tools > Options > Expert Advisors > Allow WebRequest for listed URL, and that " + ApiBaseUrl + " is in that list.";
      return -1;
   }
   responseOut = CharArrayToString(resultData);
   return status;
}

string JsonGetString(string json, string key)
{
   string needle = "\"" + key + "\":\"";
   int start = StringFind(json, needle);
   if(start < 0) return "";
   start += StringLen(needle);
   int end = StringFind(json, "\"", start);
   if(end < 0) return "";
   return StringSubstr(json, start, end - start);
}

double JsonGetDouble(string json, string key)
{
   string needle = "\"" + key + "\":";
   int start = StringFind(json, needle);
   if(start < 0) return 0;
   start += StringLen(needle);
   int end = start;
   int len = StringLen(json);
   while(end < len)
   {
      ushort c = StringGetCharacter(json, end);
      if(c == ',' || c == '}') break;
      end++;
   }
   string slice = StringSubstr(json, start, end - start);
   return StringToDouble(slice);
}

string JsonEscape(string value)
{
   string result = value;
   StringReplace(result, "\\", "\\\\");
   StringReplace(result, "\"", "\\\"");
   return result;
}
