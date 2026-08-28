// GreenBrain trade effectiveness + pattern-memory overlay.
// Uses only verified data returned by GreenBrain Core; missing pattern fields are shown as learning/unavailable.
(function () {
  function effectiveness(row) {
    const result = Number(row?.result || 0);
    const risk = Math.max(0, Number(row?.riskAmount || 0));
    const rMultiple = risk > 0 ? result / risk : null;
    if (result > 0) return { label:"EFFECTIVE", className:"effectiveness-effective", detail:rMultiple===null?"PROFIT":`+${rMultiple.toFixed(2)}R` };
    if (result < 0) return { label:"INEFFECTIVE", className:"effectiveness-ineffective", detail:rMultiple===null?"LOSS":`${rMultiple.toFixed(2)}R` };
    return { label:"NEUTRAL", className:"effectiveness-neutral", detail:risk>0?"0.00R":"FLAT" };
  }

  function patternOf(row) {
    const p=row?.pattern || {};
    return {
      key:p.key || row?.patternKey || "UNCLASSIFIED",
      setup:p.setup || row?.strategyId || "—",
      trend:p.trend || row?.regime || "—",
      volatility:p.volatilityBucket || "—",
      location:p.rangeLocation || "—",
      session:p.session || "—",
    };
  }

  function patternStats(history=[]) {
    const map=new Map();
    history.forEach(row=>{
      const p=patternOf(row); if(p.key==="UNCLASSIFIED") return;
      const result=Number(row.result||0), risk=Math.max(0,Number(row.riskAmount||0));
      const item=map.get(p.key)||{...p,samples:0,wins:0,losses:0,net:0,rSum:0,rCount:0};
      item.samples++; item.net+=result; if(result>0)item.wins++; else if(result<0)item.losses++;
      if(risk>0){item.rSum+=result/risk;item.rCount++;} map.set(p.key,item);
    });
    return [...map.values()].map(x=>({...x,winRate:x.samples?x.wins/x.samples:0,expectancyR:x.rCount?x.rSum/x.rCount:0,effective:x.samples>=3&&(x.rCount?x.rSum/x.rCount:0)>0&&(x.wins/x.samples)>=.5})).sort((a,b)=>b.expectancyR-a.expectancyR);
  }

  const style=document.createElement("style");
  style.textContent=`
    .history-table .row{grid-template-columns:.65fr .7fr .65fr .75fr 1.05fr 1.15fr}
    .effectiveness-signal,.pattern-pill{display:inline-flex;align-items:center;gap:6px;width:max-content;max-width:100%;border:1px solid var(--line2);border-radius:999px;padding:4px 8px;font-size:8px;font-weight:800;letter-spacing:.06em}
    .effectiveness-signal::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;box-shadow:0 0 9px currentColor}
    .effectiveness-effective{color:var(--accent);border-color:#315d3c;background:#102017}.effectiveness-ineffective{color:var(--red);border-color:#5b2e31;background:#1b1011}.effectiveness-neutral{color:var(--amber);border-color:#5c4c28;background:#19160e}.effectiveness-r{opacity:.68;font-weight:650}.pattern-pill{color:#b9c4bd;background:#0b100d;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .pattern-memory{margin:10px 0}.pattern-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:18px}.pattern-card{border:1px solid var(--line);background:#0a0e0c;border-radius:8px;padding:13px;display:grid;gap:8px}.pattern-card strong{font-size:11px;overflow:hidden;text-overflow:ellipsis}.pattern-card small{font-size:8px;color:var(--muted);line-height:1.5}.pattern-score{font-size:18px!important}.pattern-learning{color:var(--amber)}
    @media(max-width:900px){.pattern-grid{grid-template-columns:1fr 1fr}}@media(max-width:620px){.history-table{overflow-x:auto}.history-table .row{min-width:760px}.pattern-grid{grid-template-columns:1fr}}
  `; document.head.appendChild(style);

  const historyPanel=document.getElementById("history");
  if(historyPanel){
    const section=document.createElement("section"); section.id="patternMemory"; section.className="panel pattern-memory";
    section.innerHTML='<div class="panel-title"><div><p class="section-label">EXPERIENCE MEMORY</p><h3>Pattern Intelligence</h3></div><span id="patternMemorySummary">LEARNING</span></div><div id="patternGrid" class="pattern-grid"><div class="pattern-card"><strong>Waiting for classified trades</strong><small>GreenBrain will compare recurring market setups after verified pattern data is available.</small></div></div>';
    historyPanel.before(section);
  }

  const head=document.querySelector(".history-table .row.head");
  if(head){ head.innerHTML="<span>TIME</span><span>DECISION</span><span>RISK</span><span>RESULT</span><span>EFFECTIVENESS</span><span>PATTERN</span>"; }

  const originalRenderHistory=window.renderHistory;
  if(typeof originalRenderHistory!=="function") return;
  window.renderHistory=function(history=[]){
    const rows=document.getElementById("historyRows"), summary=document.getElementById("historySummary");
    if(!rows||!summary)return originalRenderHistory(history);
    rows.innerHTML=history.map(row=>{const signal=effectiveness(row),p=patternOf(row),amount=Number(row.result||0),risk=Number(row.riskAmount||0),time=new Date(row.timeIso).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});return `<div class="row"><span>${time}</span><span>${row.side}</span><span>$${risk.toFixed(2)}</span><span class="${amount>=0?"positive":"negative"}">${amount<0?"-":""}$${Math.abs(amount).toFixed(2)}</span><span><span class="effectiveness-signal ${signal.className}">${signal.label} <span class="effectiveness-r">${signal.detail}</span></span></span><span><span class="pattern-pill" title="${p.key}">${p.key}</span></span></div>`;}).join("");
    const effective=history.filter(x=>Number(x.result||0)>0).length, ineffective=history.filter(x=>Number(x.result||0)<0).length;
    summary.textContent=history.length?`${effective} effective · ${ineffective} ineffective · ${history.length} verified trades`:"No closed trades yet";
    const stats=patternStats(history),grid=document.getElementById("patternGrid"),mem=document.getElementById("patternMemorySummary");
    if(grid&&mem){
      mem.textContent=stats.length?`${stats.length} PATTERNS OBSERVED`:"LEARNING";
      grid.innerHTML=stats.length?stats.slice(0,8).map(x=>`<div class="pattern-card"><strong>${x.key}</strong><span class="pattern-score ${x.effective?"positive":"pattern-learning"}">${x.effective?"EFFECTIVE":"LEARNING"}</span><small>${x.samples} samples · ${(x.winRate*100).toFixed(0)}% win rate · ${x.expectancyR>=0?"+":""}${x.expectancyR.toFixed(2)}R expectancy</small><small>${x.setup} · ${x.trend} · ${x.volatility} volatility · ${x.location} range · ${x.session}</small></div>`).join(""):'<div class="pattern-card"><strong>Waiting for classified trades</strong><span class="pattern-score pattern-learning">LEARNING</span><small>The backend must attach a pattern fingerprint to closed trades before historical pattern performance can be displayed.</small></div>';
    }
  };
})();
