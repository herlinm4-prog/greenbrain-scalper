// GreenBrain dashboard client.
// This file no longer simulates anything locally. Every number on screen
// comes from GET /api/state on the GreenBrain service (src/run-service.ts).
// Controls write back via POST /api/settings and POST /api/emergency-stop.

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(window.location.search);
if (params.get("api")) localStorage.setItem("greenbrainApiBase", params.get("api"));
const API_BASE = localStorage.getItem("greenbrainApiBase") || "http://127.0.0.1:8787";

const POLL_MS = 1500;
let lastTopHistoryKey = null;
let connected = false;

function money(value) {
  const sign = value >= 0 ? "" : "-";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function log(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  $("log").prepend(item);
  while ($("log").children.length > 8) $("log").lastChild.remove();
}

function showAlert(title, text, showAction = false) {
  $("alertTitle").textContent = title;
  $("alertText").textContent = text;
  $("alert").classList.remove("hidden");
  $("alertAction").classList.toggle("hidden", !showAction);
}

function hideAlert() {
  $("alert").classList.add("hidden");
}

async function apiGet(path) {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`GET ${path} failed: ${response.status}`);
  return response.json();
}

async function apiPost(path, body) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `POST ${path} failed: ${response.status}`);
  return data;
}

function setConnectionState(isConnected) {
  if (isConnected === connected) return;
  connected = isConnected;
  if (!isConnected) {
    $("watchStatus").textContent = "GREENBRAIN SERVICE OFFLINE";
    $("decision").textContent = "OFFLINE";
    $("reason").textContent = "Cannot reach the GreenBrain service. Start it with npm start, then reload this page.";
    $("marketState").textContent = "OFFLINE";
  }
}

function renderSettings(settings) {
  document.querySelectorAll("[data-risk]").forEach((button) => {
    button.classList.toggle("selected", Number(button.dataset.risk) === settings.riskPerTradeAmount);
  });
  if (document.activeElement !== $("mode")) $("mode").value = settings.style;
  if (document.activeElement !== $("profitGoal")) $("profitGoal").value = settings.dailyProfitGoal;
  if (document.activeElement !== $("lossLimit")) $("lossLimit").value = settings.dailyLossLimit;
  $("streakBoost").checked = settings.streakAlertEnabled;
  $("riskDisplay").textContent = `$${settings.riskPerTradeAmount}`;
  $("startStop").textContent = settings.automationRunning ? "STOP AUTOMATION" : "START AUTOMATION";
}

function renderMarketMemory(memory) {
  if (!memory) {
    $("trendBadge").textContent = "LEARNING";
    $("marketMemoryText").textContent = "GreenBrain is building historical context before it trusts a directional bias.";
    $("advisorTrend").textContent = "Observing";
    $("advisorLocation").textContent = "Building range";
    $("advisorAction").textContent = "Wait";
    $("advisorText").textContent = "Waiting for enough market evidence to explain the current opportunity.";
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
  $("advisorLocation").textContent =
    memory.rangePositionPct > 80 ? "Near observed high" : memory.rangePositionPct < 20 ? "Near observed low" : "Inside historical range";
  $("advisorAction").textContent = memory.action;
  $("advisorText").textContent = memory.text;
}

function renderHistory(history) {
  $("historyRows").innerHTML = history
    .map(
      (row) =>
        `<div class="row"><span>${new Date(row.timeIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span><span>${row.side}</span><span>$${row.riskAmount.toFixed(2)}</span><span class="${row.result >= 0 ? "positive" : "negative"}">${money(row.result)}</span></div>`,
    )
    .join("");
  $("historySummary").textContent = history.length ? `${history.length} recent trades monitored` : "Monitoring every decision";
}

function renderLog(entries) {
  $("log").innerHTML = "";
  entries
    .slice(0, 8)
    .reverse()
    .forEach((entry) => log(entry));
}

function systemStateClass(state) {
  if (state === "HALTED") return "negative";
  if (state === "RISK-REVIEW") return "";
  return "safe";
}

function renderAlerts(telemetry) {
  const topRow = telemetry.history[0];
  const topKey = topRow ? `${topRow.timeIso}:${topRow.result}` : null;
  if (topKey && topKey !== lastTopHistoryKey) {
    lastTopHistoryKey = topKey;
    if (topRow.result >= 0) {
      showAlert("PROFIT ALERT", `${topRow.side} closed ${money(topRow.result)}. GreenBrain recorded the result.`);
    } else {
      showAlert("RISK ALERT", `${topRow.side} closed ${money(topRow.result)}. Risk remains limited by your settings.`);
    }
    return;
  }

  if (telemetry.halted) {
    showAlert("EMERGENCY STOP", "Automation is frozen. No new trades can be initiated.");
    return;
  }

  const advice = telemetry.riskAdvice;
  if (advice && advice.requiresUserConfirmation) {
    if (advice.state === "review-increase") {
      showAlert("GREEN STREAK", `${advice.reason} Suggested risk: $${advice.suggestedRiskAmount.toFixed(0)}.`, true);
      return;
    }
    if (advice.state === "reduce") {
      showAlert("RISK REVIEW", advice.reason, true);
      return;
    }
  }
  if (advice && advice.state === "stop") {
    showAlert("DAILY LOSS LIMIT", advice.reason);
    return;
  }

  hideAlert();
}

function render(state) {
  const { settings, telemetry } = state;
  renderSettings(settings);

  $("watchStatus").textContent = telemetry.halted ? "EMERGENCY STOP" : telemetry.running ? "WATCHING MARKETS" : "PAUSED";
  $("decision").textContent = telemetry.decision;
  $("confidence").textContent = `${telemetry.confidencePct}%`;
  $("reason").textContent = telemetry.reason;
  $("marketState").textContent = telemetry.decision === "BUY" || telemetry.decision === "SELL" ? "OPPORTUNITY" : "SCANNING";

  $("todayProfit").textContent = money(telemetry.today.profit);
  $("todayProfit").className = telemetry.today.profit > 0 ? "positive" : telemetry.today.profit < 0 ? "negative" : "";
  $("winRate").textContent = telemetry.today.wins + telemetry.today.losses
    ? `${telemetry.today.wins} wins - ${telemetry.today.winRatePct}% win rate`
    : "No closed trades yet";

  $("streak").textContent = telemetry.streak.winStreak ? `${telemetry.streak.winStreak} WINS` : "-";
  $("streakText").textContent = telemetry.streak.winStreak >= 3
    ? "Strong run detected"
    : telemetry.streak.winStreak
      ? "Positive sequence"
      : "Waiting for results";

  const systemState = $("systemState");
  systemState.textContent = telemetry.systemState;
  systemState.className = systemStateClass(telemetry.systemState);

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
    setConnectionState(true);
    render(state);
  } catch (error) {
    setConnectionState(false);
  }
}

async function updateSettings(patch, description) {
  try {
    await apiPost("/api/settings", patch);
    if (description) log(description);
    await refresh();
  } catch (error) {
    log(`Settings update rejected: ${error.message}`);
  }
}

document.querySelectorAll("[data-risk]").forEach((button) => {
  button.addEventListener("click", () => {
    const amount = Number(button.dataset.risk);
    updateSettings({ riskPerTradeAmount: amount }, `Risk per trade changed to $${amount}`);
  });
});

$("mode").addEventListener("change", () => {
  updateSettings({ style: $("mode").value }, `Trading style changed to ${$("mode").value}`);
});

$("profitGoal").addEventListener("change", () => {
  updateSettings({ dailyProfitGoal: Number($("profitGoal").value) || 1 }, "Daily profit goal updated");
});

$("lossLimit").addEventListener("change", () => {
  updateSettings({ dailyLossLimit: Number($("lossLimit").value) || 1 }, "Daily loss limit updated");
});

$("streakBoost").addEventListener("change", () => {
  updateSettings({ streakAlertEnabled: $("streakBoost").checked });
});

$("alertAction").addEventListener("click", () => {
  document.querySelector(".control").scrollIntoView({ behavior: "smooth" });
});

$("startStop").addEventListener("click", async () => {
  try {
    const state = await apiGet("/api/state");
    await updateSettings(
      { automationRunning: !state.settings.automationRunning },
      state.settings.automationRunning ? "Automation paused" : "Automation resumed",
    );
  } catch (error) {
    log("Could not toggle automation - service unreachable");
  }
});

$("emergency").addEventListener("click", async () => {
  try {
    await apiPost("/api/emergency-stop");
    log("EMERGENCY STOP ENGAGED");
    await refresh();
  } catch (error) {
    log("Could not reach the service to engage the emergency stop");
  }
});

log("GreenBrain dashboard connecting to live service...");
refresh();
setInterval(refresh, POLL_MS);
