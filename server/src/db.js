import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dataDir = path.join(__dirname, "..", "data");
const dbPath = path.join(dataDir, "orbitalcells.sqlite");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

sqlite3.verbose();

export const db = new sqlite3.Database(dbPath);

export function initSchema() {
  db.serialize(() => {
    db.run(
      `CREATE TABLE IF NOT EXISTS runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        mode TEXT,
        scenario_id TEXT,
        operator_profile_id TEXT,
        params_json TEXT,
        summary_json TEXT
      );`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS run_metrics (
        run_id INTEGER NOT NULL,
        t REAL NOT NULL,
        near_misses INTEGER,
        maneuvers INTEGER,
        delta_v REAL,
        throughput INTEGER,
        msg_rate REAL,
        FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
      );`
    );

    db.run(
      `CREATE TABLE IF NOT EXISTS run_events (
        run_id INTEGER NOT NULL,
        t REAL NOT NULL,
        type TEXT NOT NULL,
        detail_json TEXT,
        FOREIGN KEY(run_id) REFERENCES runs(id) ON DELETE CASCADE
      );`
    );
  });
}

