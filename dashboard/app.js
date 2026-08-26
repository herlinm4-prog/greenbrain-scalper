// GreenBrain flight-deck client.
// Every reading comes from GET /api/state on the GreenBrain service
// (src/run-service.ts). Controls write back via POST /api/settings,
// /api/confirm-trade, /api/dismiss-trade, and /api/emergency-stop.

const $ = (id) => document.getElementById(id);

const params = new URLSearchParams(window.location.search);
if (params.get("api")) localStorage.setItem("greenbrainApiBase", params.get("api"));
const API_BASE = localStorage.getItem("greenbrainApiBase") || "http://127.0.0.1:8787";

const POLL_MS = 1500;
const ARC_CIRCUMFERENCE = 2 * Math.PI * 92;

let lastTopHistoryKey = null;
let connected = false;
let emergencyGuardLifted = false;
let emergencyGuardTimer = null;

const DECISION_COPY = {
  BUY: "CLEARED TO BUY",
  SELL: "CLEARED TO SELL",
  WAIT: "HOLDING PATTERN",
  PENDING: "AWAITING CLEARANCE",
  HALTED: "GROUNDED",
  OFFLINE: "INSTRUMENT OFFLINE",
};

const SYSTEM_COPY = {
  PROTECTED: "SYSTEMS NOMINAL",
  PAUSED: "STANDING BY",
  HALTED: "GROUNDED",
  "RISK-REVIEW": "CAUTION ADVISORY",
};

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

function renderLog(entries) {
  $("log").innerHTML = "";
  entries.slice(0, 8).reverse().forEach((entry) => log(entry));
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
    $("watchStatus").textContent = "SERVICE OFFLINE";
    $("decisionLabel").textContent = DECISION_COPY.OFFLINE;
    $("reason").textContent = "Cannot reach the GreenBrain service. Start it with npm start, then reload this page.";
    $("marketState").textContent = "OFFLINE";
  }
}

// ---------- gauge (signature instrument) ----------
function renderGauge(telemetry) {
  const decision = telemetry.decision;
  const group = $("horizonGroup");
  const sky = $("horizonSky");
  const ground = $("horizonGround");
  const arc = $("confidenceArc");
  const stripes = $("haltStripes");
  const readout = $("confidence");
  const label = $("decisionLabel");

  label.textContent = DECISION_COPY[decision] || decision;
  readout.textContent = `${telemetry.confidencePct}%`;

  let tilt = 0;
  let skyColor = "#1a222c", groundColor = "#1a222c", arcColor = "var(--steel)";
  stripes.classList.add("hidden");

  if (decision === "BUY") {
    tilt = 18; skyColor = "#1d5a43"; groundColor = "#12251d"; arcColor = "var(--phosphor)";
  } else if (decision === "SELL") {
    tilt = -18; skyColor = "#251414"; groundColor = "#5a1d1d"; arcColor = "var(--alert)";
  } else if (decision === "PENDING") {
    tilt = 0; skyColor = "#4d3a12"; groundColor = "#4d3a12"; arcColor = "var(--amber)";
  } else if (decision === "HALTED") {
    tilt = 0; skyColor = "#3a1414"; groundColor = "#3a1414"; arcColor = "var(--alert)";
    stripes.classList.remove("hidden");
  }

  group.style.transform = `rotate(${tilt}deg)`;
  group.style.transformOrigin = "110px 110px";
  sky.style.fill = skyColor;
  ground.style.fill = groundColor;
  arc.style.stroke = arcColor;
  readout.style.color = arcColor;

  const filled = Math.max(0, Math.min(1, telemetry.confidencePct / 100)) * ARC_CIRCUMFERENCE;
  arc.setAttribute("stroke-dasharray", `${filled.toFixed(1)} ${ARC_CIRCUMFERENCE.toFixed(1)}`);
}

// ---------- settings + top strip ----------
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

  const auto = settings.automationMode === "automatic";
  $("autopilot").checked = auto;
  $("autopilotState").textContent = auto ? "EXECUTING WITHOUT CONFIRMATION" : "CONFIRM BEFORE EVERY TRADE";
  $("autopilotHint").textContent = auto
    ? "GreenBrain places approved trades immediately. You still control risk per trade, style, and daily limits."
    : "GreenBrain will show you every approved trade and wait for your confirmation before it executes anything.";
}

function renderBrokerChip(broker) {
  const chip = $("brokerChip");
  if (broker.usingRealMt5) chip.textContent = "MT5 LIVE (PULL)";
  else if (broker.pushModeEnabled) chip.textContent = "MT5 LIVE (EA)";
  else chip.textContent = "PAPER SIM";
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

function systemStateClass(state) {
  if (state === "HALTED") return "negative";
  if (state === "RISK-REVIEW") return "caution";
  return "safe";
}

// ---------- annunciator / master caution ----------
function showAlert(title, text, options = {}) {
  $("alertTitle").textContent = title;
  $("alertText").textContent = text;
  $("alert").classList.remove("hidden");
  $("alertAction").classList.toggle("hidden", !options.actionLabel);
  if (options.actionLabel) {
    $("alertAction").textContent = options.actionLabel;
    $("alertAction").classList.toggle("go", Boolean(options.actionIsGo));
  }
  $("alertDismiss").classList.toggle("hidden", !options.showDismiss);
  $("pendingDetail").classList.toggle("hidden", !options.pending);
}

function hideAlert() {
  $("alert").classList.add("hidden");
}

function renderPendingDetail(pending) {
  $("pendingSide").textContent = pending.side;
  $("pendingEntry").textContent = pending.entry.toFixed(5);
  $("pendingStop").textContent = pending.stopLoss.toFixed(5);
  $("pendingTarget").textContent = pending.takeProfit.toFixed(5);
  $("pendingRisk").textContent = `$${pending.riskAmount.toFixed(2)}`;
  const secondsLeft = Math.max(0, Math.round((pending.expiresAtMs - Date.now()) / 1000));
  $("pendingTimer").textContent = `${secondsLeft}s`;
}

function renderAlerts(telemetry) {
  if (telemetry.pendingDecision) {
    renderPendingDetail(telemetry.pendingDecision);
    showAlert(
      "CONFIRMATION REQUIRED",
      `GreenBrain wants to ${telemetry.pendingDecision.side} ${telemetry.pendingDecision.confidencePct}% confidence.`,
      { pending: true, actionLabel: "CONFIRM", actionIsGo: true, showDismiss: true },
    );
    return;
  }

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
      showAlert("GREEN STREAK", `${advice.reason} Suggested risk: $${advice.suggestedRiskAmount.toFixed(0)}.`, {
        actionLabel: "REVIEW RISK",
      });
      return;
    }
    if (advice.state === "reduce") {
      showAlert("RISK REVIEW", advice.reason, { actionLabel: "REVIEW RISK" });
      return;
    }
  }
  if (advice && advice.state === "stop") {
    showAlert("DAILY LOSS LIMIT", advice.reason);
    return;
  }

  hideAlert();
}

// ---------- main render ----------
function render(state) {
  const { settings, telemetry } = state;
  renderSettings(settings);
  renderBrokerChip(telemetry.broker);

  $("watchStatus").textContent = telemetry.halted ? "EMERGENCY STOP" : telemetry.running ? "WATCHING MARKETS" : "STANDING BY";
  $("reason").textContent = telemetry.reason;
  $("marketState").textContent = telemetry.decision === "BUY" || telemetry.decision === "SELL" ? "OPPORTUNITY" : telemetry.decision === "PENDING" ? "AWAITING CLEARANCE" : "SCANNING";

  renderGauge(telemetry);

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
  systemState.textContent = SYSTEM_COPY[telemetry.systemState] || telemetry.systemState;
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

// ---------- controls ----------
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

$("autopilot").addEventListener("change", () => {
  const enabling = $("autopilot").checked;
  updateSettings(
    { automationMode: enabling ? "automatic" : "assisted" },
    enabling ? "AUTOPILOT ENABLED - trades will execute without confirmation" : "Autopilot disabled - trades now require confirmation",
  );
});

$("alertAction").addEventListener("click", async () => {
  if ($("pendingDetail").classList.contains("hidden")) {
    document.querySelector(".control-deck").scrollIntoView({ behavior: "smooth" });
    return;
  }
  try {
    await apiPost("/api/confirm-trade");
    log("Trade confirmed");
    await refresh();
  } catch (error) {
    log(`Could not confirm trade: ${error.message}`);
  }
});

$("alertDismiss").addEventListener("click", async () => {
  try {
    await apiPost("/api/dismiss-trade");
    log("Trade dismissed");
    await refresh();
  } catch (error) {
    log(`Could not dismiss trade: ${error.message}`);
  }
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

// Guarded emergency stop: first click lifts the cover, second click (within
// 4s) actually engages it - mirrors a real guarded aircraft switch and
// prevents an accidental single-tap stop.
$("emergency").addEventListener("click", async () => {
  if (!emergencyGuardLifted) {
    emergencyGuardLifted = true;
    $("emergency").classList.add("lifted");
    emergencyGuardTimer = setTimeout(() => {
      emergencyGuardLifted = false;
      $("emergency").classList.remove("lifted");
    }, 4000);
    return;
  }
  clearTimeout(emergencyGuardTimer);
  emergencyGuardLifted = false;
  $("emergency").classList.remove("lifted");
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
