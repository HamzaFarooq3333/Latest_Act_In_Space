Orbital Cells (Hackathon Demo)
=============================

NOTE:
- For GitHub-friendly documentation, see README.md in this repo.

Security note:
- DO NOT paste or commit API keys into files.
- Set OPENAI_API_KEY as an environment variable.
- Since an API key was pasted in chat, rotate/revoke it after testing.

How to run (Windows PowerShell)
------------------------------
1) Frontend (static):
   From project root:
     python -m http.server --bind 0.0.0.0 8000
   Then open:
     http://127.0.0.1:8000/index.html

2) Backend API (Node + Express + SQLite):
   From project root:
     cd server
     npm install
     $env:OPENAI_API_KEY="your_key_here"
     npm run dev

API endpoints:
- GET  /api/health
- GET  /api/scenarios
- GET  /api/operator-profiles
- POST /api/runs
- GET  /api/runs/:id
- GET  /api/runs/:id/export.json
- GET  /api/runs/:id/export.txt
- POST /api/ai/explain  (requires OPENAI_API_KEY)

