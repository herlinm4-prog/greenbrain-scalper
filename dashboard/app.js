// GreenBrain canonical dashboard client. No local market values are simulated here.
const $ = (id) => document.getElementById(id);
const POLL_MS = 1500;
const params = new URLSearchParams(window.location.search);

function isLoopback(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
  } catch {
    return false;
  }
}

function normalizeEndpoint(value) {
  const raw = String(value || "").trim().replace(/\/$/, "");
  if (!raw) return "";
  const parsed = new URL(raw);
  if (parsed.protocol !== "https:" && !isLoopback(raw)) throw new Error("Remote GreenBrain endpoints must use HTTPS.");
  return parsed.origin + parsed.pathname.replace(/\/$/, "");
}

function localSameOriginEndpoint() {
  const host = window.location.hostname;
  return host === "127.0.0.1" || host === "localhost" ? window.location.origin : "";
}

if (params.get("api")) {
  try { localStorage.setItem("greenbrainApiBase", normalizeEndpoint(params.get("api"))); } catch { /* invalid query endpoint ignored */ }
}

let API_BASE = localStorage.getItem("greenbrainApiBase") || localSameOriginEndpoint();
let API_TOKEN = sessionStorage.getItem("greenbrainApiToken") || "";
let connected = false;
let lastTopHistoryKey = null;
let lastState = null;

function money(value) {
  const n = Number(value || 0);
  return `${n < 0 ? "-" : ""}$${Math.abs(n).toFixed(2)}`;
}

function log(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  $("log").prepend(item);
  while ($("log").children.length > 8) $("log").lastChild.remove();
}

function authHeaders(json = false) {
  const headers = {};
  if (json) headers["Content-Type"] = "application/json";
  if (API_TOKEN) headers.Authorization = `Bearer ${API_TOKEN}`;
  return headers;
}

async function apiGet(path) {
  if (!API_BASE) throw new Error("No GreenBrain endpoint configured");
  const response = await fetch(`${API_BASE}${path}`, { cache: "no-store", headers: authHeaders() });
  if (!response.ok) throw new Error(response.status === 401 ? "AUTH_REQUIRED" : `GET ${path} failed: ${response.status}`);
  return response.json();
}

async function apiPost(path, body) {
  if (!API_BASE) throw new Error("No GreenBrain endpoint configured");
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: authHeaders(true),
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(response.status === 401 ? "AUTH_REQUIRED" : data.error || `POST ${path} failed: ${response.status}`);
  return data;
}

function runtimeLabel(runtime) {
  if (runtime?.brokerMode === "mt5-push") return "MT5 PUSH · DEMO";
  if (runtime?.brokerMode === "mt5-bridge") return "MT5 BRIDGE · DEMO";
  if (runtime?.brokerMode === "paper") return "PAPER ENGINE · DEMO";
  return "UNKNOWN";
}

function setConnectionState(isConnected, detail = "") {
  connected = isConnected;
  const badge = document.querySelector(".connection");
  if (badge) badge.innerHTML = isConnected ? "<i></i>CONNECTED" : "<i></i>OFFLINE";
  $("connectionDetail").textContent = detail || (isConnected ? `Connected to ${API_BASE}` : "No GreenBrain endpoint connected.");
  $("sideConnectionText").textContent = isConnected ? runtimeLabel(lastState?.runtime) : "Waiting for GreenBrain Core";
  if (!isConnected) {
    $("watchStatus").textContent = "GREENBRAIN OFFLINE";
    $("decision").textContent = "OFFLINE";
    $("confidence").textContent = "0%";
    $("marketState").textContent = "NO DATA";
    $("runtimeBadge").textContent = "OFFLINE";
    $("brokerMode").textContent = "BROKER: UNKNOWN";
    $("feedStatus").textContent = "FEED: UNKNOWN";
    $("startStop").disabled = true;
    $("emergency").disabled = true;
    $("pendingApproval").classList.add("hidden");
  }
}

function renderConnection(runtime, telemetry) {
  const label = runtimeLabel(runtime);
  $("runtimeBadge").textContent = label;
  $("brokerMode").textContent = `BROKER: ${label}`;
  const feedHealthy = telemetry?.feedHealth?.healthy ?? telemetry?.broker?.feedHealthy;
  const age = telemetry?.feedHealth?.ageMs ?? telemetry?.broker?.feedAgeMs;
  $("feedStatus").textContent = `FEED: ${feedHealthy === false ? "STALE / BLOCKED" : feedHealthy === true ? "FRESH" : "MONITORING"}${Number.isFinite(age) ? ` · ${age}ms` : ""}`;
  $("sideConnectionText").textContent = label;
}

function renderSettings(settings) {
  document.querySelectorAll("[data-risk]").forEach((button) => button.classList.toggle("selected", Number(button.dataset.risk) === settings.riskPerTradeAmount));
  if (document.activeElement !== $("mode")) $("mode").value = settings.style;
  if (document.activeElement !== $("automationMode")) $("automationMode").value = settings.automationMode;
  if (document.activeElement !== $("profitGoal")) $("profitGoal").value = settings.dailyProfitGoal;
  if (document.activeElement !== $("lossLimit")) $("lossLimit").value = settings.dailyLossLimit;
  $("streakBoost").checked = Boolean(settings.streakAlertEnabled);
  $("riskDisplay").textContent = `$${settings.riskPerTradeAmount}`;
  $("startStop").textContent = settings.automationRunning ? "STOP AUTOMATION" : "START AUTOMATION";
  $("executionStateText").textContent = settings.automationMode === "automatic" ? "Auto Pilot · deterministic safety gates active" : "Assisted · confirmation required";
}

function renderPending(assisted, settings) {
  const pending = assisted?.pending;
  if (settings.automationMode !== "assisted" || !pending) return $("pendingApproval").classList.add("hidden");
  const seconds = Math.max(0, Math.ceil((pending.expiresAtMs - Date.now()) / 1000));
  $("pendingTitle").textContent = `${pending.side.toUpperCase()} READY`;
  $("pendingText").textContent = `${pending.confidencePct}% confidence · risk $${pending.riskAmount.toFixed(2)} · ${seconds}s remaining.`;
  $("pendingApproval").classList.remove("hidden");
}

function renderMarketMemory(memory) {
  if (!memory) {
    $("trendBadge").textContent = "LEARNING";
    $("marketMemoryText").textContent = "GreenBrain is building historical context before trusting a directional bias.";
    $("advisorTrend").textContent = "Observing";
    $("advisorLocation").textContent = "Building range";
    $("advisorAction").textContent = "Wait";
    $("advisorText").textContent = "Waiting for enough verified market evidence.";
    return;
  }
  $("periodHigh").textContent = memory.periodHigh.toFixed(5);
  $("periodLow").textContent = memory.periodLow.toFixed(5);
  $("rangeLocation").textContent = `${memory.rangePositionPct}%`;
  $("volatility").textContent = `${memory.volatilityBps.toFixed(2)} bps`;
  $("trendBadge").textContent = memory.trend.toUpperCase();
  $("rangeMarker").style.left = `${Math.max(2, Math.min(98, memory.rangePositionPct))}%`;
  $("marketMemoryText").textContent = memory.text;
  $("advisorTrend").textContent = memory.trend;
  $("advisorLocation").textContent = memory.rangePositionPct > 80 ? "Near observed high" : memory.rangePositionPct < 20 ? "Near observed low" : "Inside historical range";
  $("advisorAction").textContent = memory.action;
  $("advisorText").textContent = memory.text;
}

function renderHistory(history = []) {
  $("historyRows").innerHTML = history.map((row) => `<div class="row"><span>${new Date(row.timeIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span>${row.side}</span><span>$${row.riskAmount.toFixed(2)}</span><span class="${row.result >= 0 ? "positive" : "negative"}">${money(row.result)}</span></div>`).join("");
  $("historySummary").textContent = history.length ? `${history.length} verified recent trades` : "No closed trades yet";
}

function renderLog(entries = []) {
  $("log").innerHTML = "";
  entries.slice(0, 8).reverse().forEach((entry) => log(entry));
}

function renderAlerts(telemetry) {
  const topRow = telemetry.history?.[0];
  const topKey = topRow ? `${topRow.timeIso}:${topRow.result}` : null;
  if (topKey && topKey !== lastTopHistoryKey) {
    lastTopHistoryKey = topKey;
    $("alertTitle").textContent = topRow.result >= 0 ? "PROFIT ALERT" : "RISK ALERT";
    $("alertText").textContent = `${topRow.side} closed ${money(topRow.result)}. Result recorded by GreenBrain.`;
    $("alert").classList.remove("hidden");
    return;
  }
  if (telemetry.halted) {
    $("alertTitle").textContent = "EMERGENCY STOP";
    $("alertText").textContent = "Automation is frozen. No new trades can be initiated.";
    $("alert").classList.remove("hidden");
    return;
  }
  $("alert").classList.add("hidden");
}

function render(state) {
  lastState = state;
  const { settings, telemetry, assisted, runtime } = state;
  renderConnection(runtime, telemetry);
  renderSettings(settings);
  renderPending(assisted, settings);
  $("watchStatus").textContent = telemetry.halted ? "EMERGENCY STOP" : telemetry.running ? "WATCHING MARKETS" : "PAUSED";
  $("decision").textContent = telemetry.decision;
  $("confidence").textContent = `${telemetry.confidencePct}%`;
  $("reason").textContent = telemetry.reason;
  $("marketState").textContent = telemetry.decision === "BUY" || telemetry.decision === "SELL" ? "OPPORTUNITY" : "SCANNING";
  $("todayProfit").textContent = money(telemetry.today.profit);
  $("todayProfit").className = telemetry.today.profit > 0 ? "positive" : telemetry.today.profit < 0 ? "negative" : "";
  $("winRate").textContent = telemetry.today.wins + telemetry.today.losses ? `${telemetry.today.wins} wins · ${telemetry.today.winRatePct}% win rate` : "No closed trades yet";
  $("streak").textContent = telemetry.streak.winStreak ? `${telemetry.streak.winStreak} WINS` : "—";
  $("streakText").textContent = telemetry.streak.winStreak >= 3 ? "Strong run detected" : telemetry.streak.winStreak ? "Positive sequence" : "Waiting for results";
  $("systemState").textContent = telemetry.systemState;
  $("systemState").className = telemetry.systemState === "HALTED" ? "negative" : "safe";
  renderMarketMemory(telemetry.marketMemory);
  renderHistory(telemetry.history);
  renderLog(telemetry.log);
  renderAlerts(telemetry);
  $("startStop").disabled = telemetry.halted;
  $("emergency").disabled = telemetry.halted;
}

async function refresh() {
  try {
    const state = await apiGet("/api/state");
    render(state);
    setConnectionState(true, `Authenticated GreenBrain state received from ${API_BASE}`);
  } catch (error) {
    const auth = error.message === "AUTH_REQUIRED";
    setConnectionState(false, auth ? "Authentication required or token rejected." : API_BASE ? `Cannot reach GreenBrain at ${API_BASE}.` : "Enter a secure GreenBrain endpoint to connect.");
  }
}

async function updateSettings(patch, description) {
  try { await apiPost("/api/settings", patch); if (description) log(description); await refresh(); }
  catch (error) { log(`Settings update rejected: ${error.message}`); }
}

$("apiEndpoint").value = API_BASE;
$("apiToken").value = API_TOKEN;
$("connectApi").addEventListener("click", async () => {
  try {
    const endpoint = normalizeEndpoint($("apiEndpoint").value || localSameOriginEndpoint());
    if (!endpoint) throw new Error("Enter an HTTPS GreenBrain endpoint.");
    API_BASE = endpoint;
    API_TOKEN = $("apiToken").value.trim();
    localStorage.setItem("greenbrainApiBase", API_BASE);
    if (API_TOKEN) sessionStorage.setItem("greenbrainApiToken", API_TOKEN); else sessionStorage.removeItem("greenbrainApiToken");
    log(`Connecting to GreenBrain Core at ${API_BASE}`);
    await refresh();
  } catch (error) { setConnectionState(false, error.message); }
});
$("disconnectApi").addEventListener("click", () => {
  localStorage.removeItem("greenbrainApiBase");
  sessionStorage.removeItem("greenbrainApiToken");
  API_TOKEN = "";
  API_BASE = localSameOriginEndpoint();
  $("apiEndpoint").value = API_BASE;
  $("apiToken").value = "";
  lastState = null;
  setConnectionState(false, "Disconnected. Stored endpoint and session token cleared.");
});

document.querySelectorAll("[data-risk]").forEach((button) => button.addEventListener("click", () => updateSettings({ riskPerTradeAmount: Number(button.dataset.risk) }, `Risk changed to $${button.dataset.risk}`)));
$("mode").addEventListener("change", () => updateSettings({ style: $("mode").value }, `Trading profile changed to ${$("mode").value}`));
$("automationMode").addEventListener("change", () => updateSettings({ automationMode: $("automationMode").value }, `Execution changed to ${$("automationMode").value}`));
$("profitGoal").addEventListener("change", () => updateSettings({ dailyProfitGoal: Number($("profitGoal").value) || 1 }, "Daily profit target updated"));
$("lossLimit").addEventListener("change", () => updateSettings({ dailyLossLimit: Number($("lossLimit").value) || 1 }, "Daily loss ceiling updated"));
$("streakBoost").addEventListener("change", () => updateSettings({ streakAlertEnabled: $("streakBoost").checked }));
$("confirmTrade").addEventListener("click", async () => { try { await apiPost("/api/assisted/confirm"); await refresh(); } catch (error) { log(`Confirmation rejected: ${error.message}`); } });
$("discardTrade").addEventListener("click", async () => { try { await apiPost("/api/assisted/discard"); await refresh(); } catch (error) { log(`Discard rejected: ${error.message}`); } });
$("alertAction").addEventListener("click", () => document.querySelector(".controls")?.scrollIntoView({ behavior: "smooth" }));
$("startStop").addEventListener("click", async () => { if (!lastState) return; await updateSettings({ automationRunning: !lastState.settings.automationRunning }, lastState.settings.automationRunning ? "Automation paused" : "Automation resumed"); });
$("emergency").addEventListener("click", async () => { try { await apiPost("/api/emergency-stop"); log("EMERGENCY STOP ENGAGED"); await refresh(); } catch (error) { log(`Emergency stop failed: ${error.message}`); } });

log(API_BASE ? `Connecting to ${API_BASE}...` : "Dashboard ready. Connect GreenBrain Core to begin.");
refresh();
setInterval(refresh, POLL_MS);
