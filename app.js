const API_BASE = "http://127.0.0.1:8080";

const els = {
  btnInfo: document.getElementById("btnInfo"),
  btn3d: document.getElementById("btn3d"),
  infoView: document.getElementById("infoView"),
  simView: document.getElementById("simView"),
  openLiveSim: document.getElementById("openLiveSim"),
  navLaunchDemo: document.getElementById("navLaunchDemo"),

  canvas: document.getElementById("scene"),
  badgeMode: document.getElementById("badgeMode"),
  badgeStatus: document.getElementById("badgeStatus"),
  reasonFeed: document.getElementById("reasonFeed"),

  segmentedBtns: Array.from(document.querySelectorAll(".segmented__btn")),

  objectCount: document.getElementById("objectCount"),
  sensorNoise: document.getElementById("sensorNoise"),
  commsReliability: document.getElementById("commsReliability"),
  riskTolerance: document.getElementById("riskTolerance"),
  simSpeed: document.getElementById("simSpeed"),

  objectCountVal: document.getElementById("objectCountVal"),
  sensorNoiseVal: document.getElementById("sensorNoiseVal"),
  commsReliabilityVal: document.getElementById("commsReliabilityVal"),
  riskToleranceVal: document.getElementById("riskToleranceVal"),
  simSpeedVal: document.getElementById("simSpeedVal"),
  simReasonInterval: document.getElementById("simReasonInterval"),

  showCells: document.getElementById("showCells"),
  showIntents: document.getElementById("showIntents"),
  protectedZone: document.getElementById("protectedZone"),

  injectDebris: document.getElementById("injectDebris"),
  disableComms: document.getElementById("disableComms"),
  resetSim: document.getElementById("resetSim"),

  scenarioSelect: document.getElementById("scenarioSelect"),
  operatorSelect: document.getElementById("operatorSelect"),
  saveRun: document.getElementById("saveRun"),
  exportJson: document.getElementById("exportJson"),
  exportTxt: document.getElementById("exportTxt"),
  saveStatus: document.getElementById("saveStatus"),
  aiQuestion: document.getElementById("aiQuestion"),
  askAi: document.getElementById("askAi"),
  aiAnswer: document.getElementById("aiAnswer"),

  mNearMisses: document.getElementById("mNearMisses"),
  mManeuvers: document.getElementById("mManeuvers"),
  mDeltaV: document.getElementById("mDeltaV"),
  mThroughput: document.getElementById("mThroughput"),
  mMsgRate: document.getElementById("mMsgRate"),
};

function setSegmentedActive(mode) {
  for (const b of els.segmentedBtns) b.classList.toggle("is-active", b.dataset.mode === mode);
  const label = mode[0].toUpperCase() + mode.slice(1);
  els.badgeMode.textContent = `Mode: ${label}`;
}

function bindRange(input, out, fmt = (v) => v) {
  const update = () => {
    out.textContent = fmt(input.value);
  };
  input.addEventListener("input", update);
  update();
}

bindRange(els.objectCount, els.objectCountVal, (v) => `${v}`);
bindRange(els.sensorNoise, els.sensorNoiseVal, (v) => `${Number(v).toFixed(2)}`);
bindRange(els.commsReliability, els.commsReliabilityVal, (v) => `${Number(v).toFixed(2)}`);
bindRange(els.riskTolerance, els.riskToleranceVal, (v) => `${Number(v).toFixed(2)}`);
bindRange(els.simSpeed, els.simSpeedVal, (v) => `${Number(v).toFixed(2)}×`);
if (els.simReasonInterval) els.simReasonInterval.textContent = `~${(10 / Number(els.simSpeed.value || 1)).toFixed(0)}s`;

let app = null;
let simLoaded = false;
async function ensureSimLoaded() {
  if (simLoaded && app) return app;
  const mod = await import("./sim/simulation.js");
  app = mod.createApp({
    canvas: els.canvas,
    onReasonLine: (line) => pushReason(line),
    onMetrics: (m) => renderMetrics(m),
  });
  app.setSpeed?.(Number(els.simSpeed?.value || 1));
  simLoaded = true;
  return app;
}

let scenarios = [];
let operatorProfiles = [];
let savedRunId = null;
let selectedScenarioId = null;
let selectedOperatorId = null;

async function apiGet(path) {
  const resp = await fetch(`${API_BASE}${path}`);
  if (!resp.ok) throw new Error(`GET ${path} failed (${resp.status})`);
  return await resp.json();
}

async function apiPost(path, body) {
  const resp = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json.error || `POST ${path} failed (${resp.status})`);
  return json;
}

function setExportLinks(runId) {
  if (!runId) {
    els.exportJson.classList.add("is-disabled");
    els.exportTxt.classList.add("is-disabled");
    els.exportJson.href = "#";
    els.exportTxt.href = "#";
    return;
  }
  els.exportJson.classList.remove("is-disabled");
  els.exportTxt.classList.remove("is-disabled");
  els.exportJson.href = `${API_BASE}/api/runs/${runId}/export.json`;
  els.exportTxt.href = `${API_BASE}/api/runs/${runId}/export.txt`;
}

function applyScenarioAndOperator() {
  const scenario = scenarios.find((s) => s.id === selectedScenarioId);
  const profile = operatorProfiles.find((p) => p.id === selectedOperatorId);

  const scenarioParams = scenario?.params || {};
  const profilePolicy = profile?.policy || {};

  // Apply scenario -> sliders
  if (scenarioParams.objectCount != null) els.objectCount.value = String(scenarioParams.objectCount);
  if (scenarioParams.sensorNoise != null) els.sensorNoise.value = String(scenarioParams.sensorNoise);
  if (scenarioParams.commsReliability != null) els.commsReliability.value = String(scenarioParams.commsReliability);

  // Risk tolerance: operator profile can override scenario
  const rt = profilePolicy.riskTolerance ?? scenarioParams.riskTolerance;
  if (rt != null) els.riskTolerance.value = String(rt);

  // Fire events to update UI labels + app params
  for (const el of [els.objectCount, els.sensorNoise, els.commsReliability, els.riskTolerance]) {
    el.dispatchEvent(new Event("input"));
  }

  // Reset sim (only if sim is loaded)
  if (app) {
    els.reasonFeed.textContent = "";
    app.reset(readParams());
  }
  pushReason(`Scenario applied: ${scenario?.name || "Custom"} · Operator: ${profile?.name || "Custom"}`);
}

function pushReason(text) {
  const div = document.createElement("div");
  div.className = "line";
  div.textContent = text;
  els.reasonFeed.prepend(div);
  // keep small
  while (els.reasonFeed.childElementCount > 8) els.reasonFeed.lastElementChild?.remove();
}

function renderMetrics(m) {
  els.mNearMisses.textContent = `${m.nearMisses}`;
  els.mManeuvers.textContent = `${m.maneuvers}`;
  els.mDeltaV.textContent = `${m.deltaV.toFixed(1)}`;
  els.mThroughput.textContent = `${m.throughput}`;
  els.mMsgRate.textContent = `${m.msgRate.toFixed(1)}/s`;
}

function readParams() {
  return {
    objectCount: Number(els.objectCount.value),
    sensorNoise: Number(els.sensorNoise.value),
    commsReliability: Number(els.commsReliability.value),
    riskTolerance: Number(els.riskTolerance.value),
    overlays: {
      showCells: els.showCells.checked,
      showIntents: els.showIntents.checked,
      protectedZone: els.protectedZone.checked,
    },
  };
}

function showView(which) {
  const isInfo = which === "info";
  els.infoView?.classList.toggle("is-hidden", !isInfo);
  els.simView?.classList.toggle("is-hidden", isInfo);
  if (els.infoView) {
    els.infoView.hidden = !isInfo;
    els.infoView.setAttribute("aria-hidden", String(!isInfo));
  }
  if (els.simView) {
    els.simView.hidden = isInfo;
    els.simView.setAttribute("aria-hidden", String(isInfo));
  }
  els.btnInfo?.classList.toggle("is-active", isInfo);
  els.btn3d?.classList.toggle("is-active", !isInfo);
  if (isInfo) {
    els.badgeStatus.textContent = "Status: Idle (open 3D View)";
  }
  // Ensure user lands at the top of the chosen view
  window.scrollTo({ top: 0, behavior: "auto" });
}

els.btnInfo?.addEventListener("click", () => showView("info"));
els.btn3d?.addEventListener("click", async () => {
  showView("3d");
  const a = await ensureSimLoaded();
  // first-time init
  if (!els.badgeStatus.textContent.includes("Running")) {
    setSegmentedActive("swarm");
    a.reset(readParams());
    els.badgeStatus.textContent = "Status: Running";
  }
});

function switchTo3dFromLink(e) {
  e?.preventDefault?.();
  els.btn3d?.click();
  // Scroll to simulation header
  document.getElementById("simulation")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

els.openLiveSim?.addEventListener("click", switchTo3dFromLink);
els.navLaunchDemo?.addEventListener("click", switchTo3dFromLink);

for (const b of els.segmentedBtns) {
  b.addEventListener("click", () => {
    const mode = b.dataset.mode;
    setSegmentedActive(mode);
    if (!app) return;
    app.setMode(mode);
  });
}

const ranges = [els.objectCount, els.sensorNoise, els.commsReliability, els.riskTolerance];
for (const r of ranges)
  r.addEventListener("input", () => {
    if (!app) return;
    app.setParams(readParams());
  });

els.simSpeed?.addEventListener("input", async () => {
  if (els.simReasonInterval) els.simReasonInterval.textContent = `~${(10 / Number(els.simSpeed.value || 1)).toFixed(0)}s`;
  const a = await ensureSimLoaded();
  a.setSpeed?.(Number(els.simSpeed.value || 1));
});
for (const c of [els.showCells, els.showIntents, els.protectedZone])
  c.addEventListener("change", () => {
    if (!app) return;
    app.setParams(readParams());
  });

els.injectDebris.addEventListener("click", async () => {
  const a = await ensureSimLoaded();
  a.injectDebris();
});
els.disableComms.addEventListener("click", () => {
  els.commsReliability.value = "0";
  els.commsReliability.dispatchEvent(new Event("input"));
  pushReason("Comms disabled: switching to conservative local margins.");
});
els.resetSim.addEventListener("click", () => {
  els.reasonFeed.textContent = "";
  if (!app) return;
  app.reset(readParams());
  pushReason("Simulation reset.");
});

els.saveRun.addEventListener("click", async () => {
  try {
    els.saveStatus.textContent = "Saving…";
    const a = await ensureSimLoaded();
    const exp = a.getRunExport();
    // lightweight summary (final counters)
    const summary = {
      nearMisses: exp.summary.nearMisses,
      maneuvers: exp.summary.maneuvers,
      deltaV: exp.summary.deltaV,
      throughput: exp.summary.throughput,
      msgRate: exp.summary.msgRate,
    };
    const metrics = exp.metrics.map((m) => ({
      t: m.t,
      nearMisses: m.nearMisses,
      maneuvers: m.maneuvers,
      deltaV: m.deltaV,
      throughput: m.throughput,
      msgRate: m.msgRate,
    }));
    const events = exp.events;
    const payload = {
      mode: exp.mode,
      scenarioId: selectedScenarioId,
      operatorProfileId: selectedOperatorId,
      params: { ...exp.params, scenarioId: selectedScenarioId, operatorProfileId: selectedOperatorId },
      summary,
      metrics,
      events,
    };
    const saved = await apiPost("/api/runs", payload);
    savedRunId = saved.id;
    setExportLinks(savedRunId);
    els.saveStatus.textContent = `Saved run #${savedRunId}.`;
    els.aiAnswer.textContent = "Saved. Ask a question about this run.";
  } catch (e) {
    els.saveStatus.textContent = `Save failed: ${String(e?.message || e)}`;
  }
});

els.askAi.addEventListener("click", async () => {
  const q = (els.aiQuestion.value || "").trim();
  if (!savedRunId) {
    els.aiAnswer.textContent = "Save a run first.";
    return;
  }
  if (!q) {
    els.aiAnswer.textContent = "Type a question first.";
    return;
  }
  try {
    els.aiAnswer.textContent = "Thinking…";
    const resp = await apiPost("/api/ai/explain", { runId: savedRunId, question: q });
    const diag = resp.diagnostics?.attempts?.length ? `\n\n(model: ${resp.modelUsed}, attempts: ${resp.diagnostics.totalAttempts})` : "";
    els.aiAnswer.textContent = `${resp.answer || ""}${diag}`;
  } catch (e) {
    els.aiAnswer.textContent = `AI failed: ${String(e?.message || e)}\n\nMake sure the API server is running and OPENAI_API_KEY is set.`;
  }
});

async function initSelections() {
  try {
    const health = await apiGet("/api/health");
    pushReason(`API connected: ${health.status} (db runs: ${health.db?.runCount ?? "?"})`);
  } catch {
    pushReason("API not reachable. Start backend at http://127.0.0.1:8080 to enable save/export/AI.");
  }

  try {
    const s = await apiGet("/api/scenarios");
    scenarios = s.scenarios || [];
    els.scenarioSelect.innerHTML = `<option value=\"\">Custom</option>` + scenarios.map((x) => `<option value=\"${x.id}\">${x.name}</option>`).join("");
  } catch {
    els.scenarioSelect.innerHTML = `<option value=\"\">(API offline)</option>`;
  }

  try {
    const p = await apiGet("/api/operator-profiles");
    operatorProfiles = p.operatorProfiles || [];
    els.operatorSelect.innerHTML = `<option value=\"\">Custom</option>` + operatorProfiles.map((x) => `<option value=\"${x.id}\">${x.name}</option>`).join("");
  } catch {
    els.operatorSelect.innerHTML = `<option value=\"\">(API offline)</option>`;
  }

  // defaults
  selectedScenarioId = scenarios[0]?.id || null;
  selectedOperatorId = operatorProfiles[1]?.id || null; // standard if exists
  if (selectedScenarioId) els.scenarioSelect.value = selectedScenarioId;
  if (selectedOperatorId) els.operatorSelect.value = selectedOperatorId;
  applyScenarioAndOperator();
}

els.scenarioSelect.addEventListener("change", () => {
  selectedScenarioId = els.scenarioSelect.value || null;
  applyScenarioAndOperator();
});
els.operatorSelect.addEventListener("change", () => {
  selectedOperatorId = els.operatorSelect.value || null;
  applyScenarioAndOperator();
});

// Init
showView("info");
setSegmentedActive("swarm");
els.badgeStatus.textContent = "Status: Idle (open 3D View)";
setExportLinks(null);
initSelections();

