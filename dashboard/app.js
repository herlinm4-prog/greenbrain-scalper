const $ = (id) => document.getElementById(id);
const state = { mid: 1.1, tick: 0, halted: false, seed: 91 };

function random() {
  state.seed = (1664525 * state.seed + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

function log(message) {
  const item = document.createElement("li");
  item.textContent = `${new Date().toLocaleTimeString()}  ${message}`;
  $("log").prepend(item);
  while ($("log").children.length > 8) $("log").lastChild.remove();
}

function tick() {
  if (state.halted) return;
  const movement = (random() - 0.5) * 0.00035;
  state.mid += movement;
  state.tick += 1;
  const momentum = movement / state.mid;
  const confidence = Math.min(88, Math.round(45 + Math.abs(momentum) * 170000));
  const actionable = confidence >= 65;
  const direction = movement > 0 ? "BUY" : "SELL";

  $("price").textContent = state.mid.toFixed(5);
  $("confidence").textContent = `${confidence}%`;
  $("regime").textContent = Math.abs(momentum) > 0.00009 ? "EXPANSION" : "RANGING";
  $("survival").textContent = actionable ? `${Math.round(confidence * 0.82)}%` : "TESTING";
  $("decision").textContent = actionable ? direction : "WAIT";
  $("reason").textContent = actionable
    ? "Synthetic momentum passed the demonstration threshold. No real order will be placed."
    : "Confidence remains below the execution threshold.";
  $("approve").disabled = !actionable;
  $("reject").disabled = !actionable;
  if (state.tick % 3 === 0) log(actionable ? `${direction} hypothesis sent to shadow market.` : "No-trade decision preserved capital.");
}

$("emergency").addEventListener("click", () => {
  state.halted = true;
  $("decision").textContent = "HALTED";
  $("reason").textContent = "Emergency stop engaged. All automated decisions are frozen.";
  $("approve").disabled = true;
  $("reject").disabled = true;
  log("EMERGENCY STOP ENGAGED");
});

log("GreenBrain Core initialized in demo mode.");
setInterval(tick, 1200);
tick();
