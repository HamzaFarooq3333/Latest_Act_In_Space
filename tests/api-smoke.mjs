const API = "http://127.0.0.1:8080";

async function jget(path) {
  const r = await fetch(`${API}${path}`);
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {
    // ignore
  }
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status} ${t.slice(0, 200)}`);
  return j ?? t;
}

async function jpost(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const t = await r.text();
  let j = null;
  try {
    j = JSON.parse(t);
  } catch {
    // ignore
  }
  if (!r.ok) throw new Error(`POST ${path} -> ${r.status} ${t.slice(0, 200)}`);
  return j ?? t;
}

async function main() {
  console.log("health…");
  const health = await jget("/api/health");
  console.log("health ok:", health.status);

  console.log("scenarios…");
  const sc = await jget("/api/scenarios");
  console.log("scenarios:", sc.scenarios?.length ?? 0);

  console.log("operator profiles…");
  const op = await jget("/api/operator-profiles");
  console.log("profiles:", op.operatorProfiles?.length ?? 0);

  console.log("save run…");
  const saved = await jpost("/api/runs", {
    mode: "swarm",
    scenarioId: sc.scenarios?.[0]?.id ?? null,
    operatorProfileId: op.operatorProfiles?.[0]?.id ?? null,
    params: { objectCount: 120, sensorNoise: 0.2, commsReliability: 0.9, riskTolerance: 0.3 },
    summary: { nearMisses: 1, maneuvers: 2, deltaV: 0.4, throughput: 3, msgRate: 0.2 },
    metrics: [
      { t: 0, nearMisses: 0, maneuvers: 0, deltaV: 0, throughput: 0, msgRate: 0 },
      { t: 1, nearMisses: 1, maneuvers: 2, deltaV: 0.4, throughput: 3, msgRate: 0.2 },
    ],
    events: [{ t: 0.5, type: "debris_injected", detail: { sector: 4 } }],
  });
  console.log("saved id:", saved.id);

  console.log("fetch run…");
  const run = await jget(`/api/runs/${saved.id}`);
  console.log("run fetched:", run.run?.id);

  console.log("export json…");
  await jget(`/api/runs/${saved.id}/export.json`);
  console.log("export json ok");

  console.log("export txt…");
  const txt = await fetch(`${API}/api/runs/${saved.id}/export.txt`).then((r) => r.text());
  if (!txt.includes("Orbital Cells Run Report")) throw new Error("export txt missing header");
  console.log("export txt ok");

  console.log("delete run…");
  const del = await fetch(`${API}/api/runs/${saved.id}`, { method: "DELETE" }).then((r) => r.json());
  if ((del.deleted ?? 0) < 1) throw new Error("delete failed");
  console.log("delete ok");

  console.log("ai explain (optional)…");
  const ai = await fetch(`${API}/api/ai/explain`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runId: saved.id, question: "Summarize what happened and why maneuvers occurred." }),
  });
  console.log("ai status:", ai.status, "(expected 200 if OPENAI_API_KEY set, else 400)");

  console.log("OK");
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});

