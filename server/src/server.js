import express from "express";
import cors from "cors";
import { db, initSchema } from "./db.js";
import { discoverStandbyModels } from "./ai/models.js";
import { chatWithFallback } from "./ai/client.js";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(
  cors({
    origin: ["http://127.0.0.1:5173", "http://localhost:5173"],
  })
);
app.use(express.json({ limit: "1mb" }));

initSchema();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
let standbyModels = [];

async function refreshModels() {
  if (!OPENAI_API_KEY) return;
  try {
    standbyModels = await discoverStandbyModels({ apiKey: OPENAI_API_KEY, standbyCount: 5 });
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("Model discovery failed:", String(e?.message || e));
  }
}

refreshModels();

const scenarios = [
  {
    id: "dense-leo",
    name: "Dense LEO",
    description: "High object count, moderate noise, active debris risk.",
    params: { objectCount: 180, sensorNoise: 0.2, commsReliability: 0.85, riskTolerance: 0.35 },
  },
  {
    id: "comms-outage",
    name: "Comms Outage",
    description: "Gradual collapse of communications reliability mid-run.",
    params: { objectCount: 130, sensorNoise: 0.25, commsReliability: 0.4, riskTolerance: 0.3 },
  },
  {
    id: "protected-zone-ops",
    name: "Protected Zone Ops",
    description: "High-priority traffic around a protected zone (station-like).",
    params: { objectCount: 140, sensorNoise: 0.18, commsReliability: 0.9, riskTolerance: 0.25 },
  },
  {
    id: "debris-sweep",
    name: "Debris Sweep",
    description: "Periodic debris sweeps through the main ring.",
    params: { objectCount: 160, sensorNoise: 0.22, commsReliability: 0.8, riskTolerance: 0.3 },
  },
];

app.get("/api/health", (_req, res) => {
  db.get("SELECT COUNT(*) as runCount FROM runs", (err, row) => {
    res.json({
      status: err ? "degraded" : "ok",
      time: new Date().toISOString(),
      version: "0.1.0",
      db: err ? { error: err.message } : { runCount: row?.runCount ?? 0 },
    });
  });
});

app.get("/api/scenarios", (_req, res) => {
  res.json({ scenarios });
});

const operatorProfiles = [
  {
    id: "crewed",
    name: "Crewed",
    description: "Very low risk tolerance, large safety margins, highest priority.",
    policy: { riskTolerance: 0.1, minSeparationScale: 1.4, priorityWeight: 3 },
  },
  {
    id: "standard",
    name: "Standard",
    description: "Balanced operations for typical constellations.",
    policy: { riskTolerance: 0.35, minSeparationScale: 1.0, priorityWeight: 2 },
  },
  {
    id: "experimental",
    name: "Experimental",
    description: "Higher risk tolerance, aggressive throughput.",
    policy: { riskTolerance: 0.55, minSeparationScale: 0.8, priorityWeight: 1 },
  },
];

app.get("/api/operator-profiles", (_req, res) => {
  res.json({ operatorProfiles });
});

app.post("/api/ai/explain", async (req, res) => {
  if (!OPENAI_API_KEY) return res.status(400).json({ error: "OPENAI_API_KEY not set" });
  if (!standbyModels.length) await refreshModels();
  if (!standbyModels.length) return res.status(500).json({ error: "no models available (discovery failed)" });

  const { runId, question } = req.body || {};
  const id = Number(runId);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid runId" });
  if (!question || typeof question !== "string") return res.status(400).json({ error: "missing question" });

  db.get("SELECT * FROM runs WHERE id = ?", [id], async (err, runRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!runRow) return res.status(404).json({ error: "run not found" });

    db.all("SELECT * FROM run_metrics WHERE run_id = ? ORDER BY t ASC", [id], async (err2, metricRows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.all("SELECT * FROM run_events WHERE run_id = ? ORDER BY t ASC", [id], async (err3, eventRows) => {
        if (err3) return res.status(500).json({ error: err3.message });

        const params = JSON.parse(runRow.params_json || "{}");
        const summary = JSON.parse(runRow.summary_json || "{}");
        const metricsSample = metricRows.slice(-25); // last 25 points
        const eventsSample = eventRows.slice(-20);

        const system = `You are Orbital Cells Explainability Assistant.\n` +
          `Answer questions about a saved simulation run.\n` +
          `Be concise, technical, and avoid speculation. If the data is insufficient, say what is missing.\n` +
          `Explain using: mode, scenario, operator profile, metrics trends, and events timeline.\n`;

        const context =
          `Run:\n` +
          `- id: ${runRow.id}\n` +
          `- created_at: ${runRow.created_at}\n` +
          `- mode: ${runRow.mode}\n` +
          `- scenario_id: ${runRow.scenario_id}\n` +
          `- operator_profile_id: ${runRow.operator_profile_id}\n\n` +
          `Params:\n${JSON.stringify(params, null, 2)}\n\n` +
          `Summary:\n${JSON.stringify(summary, null, 2)}\n\n` +
          `MetricsSample(last ${metricsSample.length}):\n${JSON.stringify(metricsSample, null, 2)}\n\n` +
          `EventsSample(last ${eventsSample.length}):\n${JSON.stringify(eventsSample, null, 2)}\n`;

        try {
          const { content, modelUsed, diagnostics } = await chatWithFallback({
            apiKey: OPENAI_API_KEY,
            models: standbyModels,
            messages: [
              { role: "system", content: system },
              { role: "user", content: `${context}\n\nQuestion: ${question}` },
            ],
            timeoutMs: 9000,
            maxRetriesPerModel: 2,
          });
          return res.json({
            answer: content,
            modelUsed,
            diagnostics: {
              totalAttempts: diagnostics.totalAttempts,
              attempts: diagnostics.attempts.map((a) => ({
                model: a.model,
                attempt: a.attempt,
                ok: a.ok,
                status: a.status,
                elapsedMs: a.elapsedMs,
              })),
            },
          });
        } catch (e) {
          return res.status(502).json({ error: "ai_failed", detail: String(e?.message || e) });
        }
      });
    });
  });
});

app.post("/api/runs", (req, res) => {
  const { mode, scenarioId, operatorProfileId, params, summary, metrics, events } = req.body || {};
  const createdAt = new Date().toISOString();

  db.run(
    `INSERT INTO runs (created_at, mode, scenario_id, operator_profile_id, params_json, summary_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [createdAt, mode ?? null, scenarioId ?? null, operatorProfileId ?? null, JSON.stringify(params ?? {}), JSON.stringify(summary ?? {})],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      const runId = this.lastID;

      const insertMetric = db.prepare(
        `INSERT INTO run_metrics (run_id, t, near_misses, maneuvers, delta_v, throughput, msg_rate)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      for (const m of metrics ?? []) {
        insertMetric.run([
          runId,
          m.t,
          m.nearMisses ?? 0,
          m.maneuvers ?? 0,
          m.deltaV ?? 0,
          m.throughput ?? 0,
          m.msgRate ?? 0,
        ]);
      }
      insertMetric.finalize();

      const insertEvent = db.prepare(
        `INSERT INTO run_events (run_id, t, type, detail_json)
         VALUES (?, ?, ?, ?)`
      );
      for (const ev of events ?? []) {
        insertEvent.run([runId, ev.t, ev.type, JSON.stringify(ev.detail ?? {})]);
      }
      insertEvent.finalize();

      res.status(201).json({ id: runId, createdAt });
    }
  );
});

app.get("/api/runs/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });

  db.get("SELECT * FROM runs WHERE id = ?", [id], (err, runRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!runRow) return res.status(404).json({ error: "not found" });

    db.all("SELECT * FROM run_metrics WHERE run_id = ? ORDER BY t ASC", [id], (err2, metricRows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.all("SELECT * FROM run_events WHERE run_id = ? ORDER BY t ASC", [id], (err3, eventRows) => {
        if (err3) return res.status(500).json({ error: err3.message });

        res.json({
          run: {
            id: runRow.id,
            createdAt: runRow.created_at,
            mode: runRow.mode,
            scenarioId: runRow.scenario_id,
            operatorProfileId: runRow.operator_profile_id,
            params: JSON.parse(runRow.params_json || "{}"),
            summary: JSON.parse(runRow.summary_json || "{}"),
          },
          metrics: metricRows.map((m) => ({
            t: m.t,
            nearMisses: m.near_misses,
            maneuvers: m.maneuvers,
            deltaV: m.delta_v,
            throughput: m.throughput,
            msgRate: m.msg_rate,
          })),
          events: eventRows.map((e) => ({
            t: e.t,
            type: e.type,
            detail: JSON.parse(e.detail_json || "{}"),
          })),
        });
      });
    });
  });
});

app.get("/api/runs/:id/export.json", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  db.get("SELECT * FROM runs WHERE id = ?", [id], (err, runRow) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!runRow) return res.status(404).json({ error: "not found" });
    db.all("SELECT * FROM run_metrics WHERE run_id = ? ORDER BY t ASC", [id], (err2, metricRows) => {
      if (err2) return res.status(500).json({ error: err2.message });
      db.all("SELECT * FROM run_events WHERE run_id = ? ORDER BY t ASC", [id], (err3, eventRows) => {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({
          run: runRow,
          metrics: metricRows,
          events: eventRows,
        });
      });
    });
  });
});

app.get("/api/runs/:id/export.txt", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).type("text/plain").send("invalid id");
  db.get("SELECT * FROM runs WHERE id = ?", [id], (err, runRow) => {
    if (err) return res.status(500).type("text/plain").send(err.message);
    if (!runRow) return res.status(404).type("text/plain").send("not found");
    db.all("SELECT * FROM run_metrics WHERE run_id = ? ORDER BY t ASC", [id], (err2, metricRows) => {
      if (err2) return res.status(500).type("text/plain").send(err2.message);
      db.all("SELECT * FROM run_events WHERE run_id = ? ORDER BY t ASC", [id], (err3, eventRows) => {
        if (err3) return res.status(500).type("text/plain").send(err3.message);

        const summary = JSON.parse(runRow.summary_json || "{}");
        const params = JSON.parse(runRow.params_json || "{}");

        let out = "";
        out += `Orbital Cells Run Report\n`;
        out += `========================\n\n`;
        out += `Run ID: ${runRow.id}\n`;
        out += `Created: ${runRow.created_at}\n`;
        out += `Mode: ${runRow.mode ?? "-"}\n`;
        out += `Scenario: ${runRow.scenario_id ?? "-"}\n`;
        out += `Operator profile: ${runRow.operator_profile_id ?? "-"}\n\n`;

        out += `Parameters:\n`;
        out += JSON.stringify(params, null, 2) + "\n\n";

        out += `Summary (computed):\n`;
        out += JSON.stringify(summary, null, 2) + "\n\n";

        if (metricRows.length) {
          out += `Metrics (first 10 points):\n`;
          for (const m of metricRows.slice(0, 10)) {
            out += `  t=${m.t.toFixed(1)}  nearMisses=${m.near_misses} maneuvers=${m.maneuvers} deltaV=${m.delta_v.toFixed(
              2
            )} throughput=${m.throughput} msgRate=${m.msg_rate.toFixed(2)}\n`;
          }
          out += "\n";
        }

        if (eventRows.length) {
          out += `Events:\n`;
          for (const e of eventRows) {
            out += `  t=${e.t.toFixed(1)}  type=${e.type}  detail=${e.detail_json}\n`;
          }
          out += "\n";
        }

        res.type("text/plain").send(out);
      });
    });
  });
});

app.delete("/api/runs/:id", (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: "invalid id" });
  db.run("DELETE FROM runs WHERE id = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    return res.json({ deleted: this.changes });
  });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`OrbitalCells API listening on http://127.0.0.1:${PORT}`);
});

