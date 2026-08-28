// GreenBrain trade effectiveness overlay.
// Uses only verified closed-trade data already returned by GreenBrain Core.
(function () {
  function effectiveness(row) {
    const result = Number(row?.result || 0);
    const risk = Math.max(0, Number(row?.riskAmount || 0));
    const rMultiple = risk > 0 ? result / risk : null;

    if (result > 0) {
      return {
        label: "EFFECTIVE",
        className: "effectiveness-effective",
        detail: rMultiple === null ? "PROFIT" : `${rMultiple >= 0 ? "+" : ""}${rMultiple.toFixed(2)}R`,
      };
    }

    if (result < 0) {
      return {
        label: "INEFFECTIVE",
        className: "effectiveness-ineffective",
        detail: rMultiple === null ? "LOSS" : `${rMultiple.toFixed(2)}R`,
      };
    }

    return {
      label: "NEUTRAL",
      className: "effectiveness-neutral",
      detail: risk > 0 ? "0.00R" : "FLAT",
    };
  }

  const style = document.createElement("style");
  style.textContent = `
    .history-table .row{grid-template-columns:.8fr .9fr .8fr .9fr 1.35fr}
    .effectiveness-signal{display:inline-flex;align-items:center;gap:6px;width:max-content;border:1px solid var(--line2);border-radius:999px;padding:4px 8px;font-size:8px;font-weight:800;letter-spacing:.06em}
    .effectiveness-signal::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 9px currentColor}
    .effectiveness-effective{color:var(--accent);border-color:#315d3c;background:#102017}
    .effectiveness-ineffective{color:var(--red);border-color:#5b2e31;background:#1b1011}
    .effectiveness-neutral{color:var(--amber);border-color:#5c4c28;background:#19160e}
    .effectiveness-r{opacity:.68;font-weight:650}
    @media(max-width:620px){.history-table{overflow-x:auto}.history-table .row{min-width:560px}}
  `;
  document.head.appendChild(style);

  const head = document.querySelector(".history-table .row.head");
  if (head && head.children.length === 4) {
    const cell = document.createElement("span");
    cell.textContent = "EFFECTIVENESS";
    head.appendChild(cell);
  }

  const originalRenderHistory = window.renderHistory;
  if (typeof originalRenderHistory !== "function") return;

  window.renderHistory = function renderHistoryWithEffectiveness(history = []) {
    const rows = document.getElementById("historyRows");
    const summary = document.getElementById("historySummary");
    if (!rows || !summary) return originalRenderHistory(history);

    rows.innerHTML = history.map((row) => {
      const signal = effectiveness(row);
      const amount = Number(row.result || 0);
      const risk = Number(row.riskAmount || 0);
      const time = new Date(row.timeIso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      const resultText = `${amount < 0 ? "-" : ""}$${Math.abs(amount).toFixed(2)}`;
      return `<div class="row"><span>${time}</span><span>${row.side}</span><span>$${risk.toFixed(2)}</span><span class="${amount >= 0 ? "positive" : "negative"}">${resultText}</span><span><span class="effectiveness-signal ${signal.className}">${signal.label} <span class="effectiveness-r">${signal.detail}</span></span></span></div>`;
    }).join("");

    const effective = history.filter((row) => Number(row.result || 0) > 0).length;
    const ineffective = history.filter((row) => Number(row.result || 0) < 0).length;
    summary.textContent = history.length
      ? `${effective} effective · ${ineffective} ineffective · ${history.length} verified trades`
      : "No closed trades yet";
  };

  if (window.lastState?.telemetry?.history) window.renderHistory(window.lastState.telemetry.history);
})();
