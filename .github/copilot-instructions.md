# Copilot instructions: Orbital Cells demo

## What this repo is
- A hackathon demo for ActInSpace / CNES #13: “Orchestrating the orbital ballet”.
- Frontend: static HTML/CSS/JS + Three.js simulation in `index.html`, `styles.css`, `app.js`, `sim/`.
- Backend (optional but recommended): Node/Express + SQLite in `server/` that provides scenarios, operator profiles, run persistence, export, and an AI explainability endpoint.

## How to run (Windows PowerShell)

### Option A: Frontend-only (no API)
From the repo root:

```powershell
python -m http.server --bind 0.0.0.0 8000
```

Open:
- `http://127.0.0.1:8000/index.html`

Notes:
- In frontend-only mode, scenario/operator dropdowns show “(API offline)”.
- The 3D simulation still runs, including the speed control.

### Option B: Full demo (frontend + backend API)
1) Backend (Terminal 1)

```powershell
cd server
npm install
$env:OPENAI_API_KEY="YOUR_KEY"   # optional; only needed for /api/ai/explain
npm run dev
```

Backend runs on:
- `http://127.0.0.1:8080`

2) Frontend (Terminal 2)

```powershell
cd ..
python -m http.server --bind 0.0.0.0 8000
```

Open:
- `http://127.0.0.1:8000/index.html`

## Demo script (what to click)
- Click **3D View**
- Try **Simulation speed** slider (changes motion + reason cadence)
- Change **Mode** (Baseline / Centralized / Swarm / Hybrid)
- Click **Inject debris**, then **Save run**, then **Export TXT/JSON**
- If backend + key is configured: Save run → ask a question in **Ask AI**

