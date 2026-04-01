# Orbital Cells — ActInSpace (CNES #13) demo

This repo is a hackathon prototype for **“Orchestrating the orbital ballet”**: showing how **decentralized coordination (swarm rules)** plus a **hybrid learning suggestion layer** can scale space traffic management beyond a single “control tower”.

## What the website shows

The UI intentionally has two completely separate views:

### Information view
- **Hero / Concept**: the core pitch (why centralized control doesn’t scale; what Orbital Cells is).
- **What you’ll see**: a quick checklist of the demo capabilities.
- **Dual-use wedge**: how the same “traffic cell coordination” can ship on Earth first (revenue) and later qualify for space.
- **Rollout roadmap**: Phase 1 (Earth pilots) → Phase 2 (space sandbox) → Phase 3 (space qualification).

### 3D View
- **Live 3D simulation**: Earth + orbital rings + satellites.
- **Simulation speed**: controls motion + decision cadence (reason codes). At 1.0× it targets ~1 reason wave every ~10 seconds.
- **Scenario & operator**:
  - Scenario: presets (dense traffic, comms outage, protected zone ops, debris sweep).
  - Operator profile: risk posture (crewed/standard/experimental).
- **Mode switch**:
  - Baseline: little/no coordination.
  - Centralized: global planner with latency (slower reaction).
  - Swarm: local rules (separation / hazard avoidance / yielding).
  - Hybrid: swarm + “learned” efficiency suggestion (wait/coordinate when safe).
- **Overlays**:
  - Cells: shows the “traffic cell” partitioning.
  - Intents: shows short intent lines when comms succeed.
  - Protected zone: a policy constraint region.
- **Actions**:
  - Inject debris: introduces a hazard crossing the main ring.
  - Disable comms: degrades intent sharing.
  - Reset: restarts the run.
- **Reason codes**: an explainability feed that describes *why* maneuvers or yielding happened.
- **Live metrics**: simple proxies visible during a demo (near-misses, maneuvers, Δv proxy, throughput proxy, message rate).
- **Run + report** (backend-enabled):
  - Save run: stores summary + metric time-series + events in SQLite.
  - Export JSON/TXT: generates a report from the saved run.
  - Ask AI (optional): uses `/api/ai/explain` to answer questions about a saved run (requires `OPENAI_API_KEY`).

## Repo structure
- `index.html`, `styles.css`, `app.js`: frontend UI + wiring
- `sim/`: Three.js scene + simulation engine
- `assets/`: textures used by the 3D scene
- `server/`: Express + SQLite API
- `tests/`: API smoke tests
- `ActInSpace_CNES13_OrbitalCells_Solution.txt`: full concept + business plan writeup
- `PROGRESS.txt`, `COMPLETED.txt`: tracking files used during development

## How to run (Windows PowerShell)

### Frontend-only

```powershell
python -m http.server --bind 0.0.0.0 8000
```

Open:
- `http://127.0.0.1:8000/index.html`

### Full demo (frontend + backend)

Backend:

```powershell
cd server
npm install
$env:OPENAI_API_KEY="YOUR_KEY"   # optional; only needed for /api/ai/explain
npm run dev
```

Frontend:

```powershell
cd ..
python -m http.server --bind 0.0.0.0 8000
```

## Security
- **Never commit API keys**.
- The backend reads `OPENAI_API_KEY` from the environment only.

