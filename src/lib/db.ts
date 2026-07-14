import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");

let _db: Database.Database | null = null;
let _ftsAvailable = false;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS channels (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  platform TEXT NOT NULL DEFAULT 'other',
  author TEXT,
  thumbnail_url TEXT,
  duration_sec INTEGER,
  media_path TEXT,
  channel_id INTEGER REFERENCES channels(id),
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  transcript TEXT,
  segments_json TEXT,
  summary TEXT,
  key_points_json TEXT,
  key_quotes_json TEXT,
  tags_json TEXT,
  action_items_json TEXT,
  decisions_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id INTEGER NOT NULL REFERENCES notes(id),
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  run_after TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS connectors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL UNIQUE,
  access_token TEXT,
  refresh_token TEXT,
  expires_at TEXT,
  config_json TEXT,
  last_synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seen_items (
  connector_id INTEGER NOT NULL REFERENCES connectors(id),
  external_id TEXT NOT NULL,
  PRIMARY KEY (connector_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_jobs_pending ON jobs(status, run_after);
CREATE INDEX IF NOT EXISTS idx_notes_status ON notes(status);
`;

const FTS_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title, transcript, summary, tags,
  content='',
  contentless_delete=1
);
`;

/** Adds columns introduced after the first release to pre-existing databases. */
function migrate(db: Database.Database) {
  const cols = new Set(
    (db.prepare("PRAGMA table_info(notes)").all() as { name: string }[]).map((c) => c.name)
  );
  const add: Record<string, string> = {
    action_items_json: "TEXT",
    decisions_json: "TEXT",
  };
  for (const [name, type] of Object.entries(add)) {
    if (!cols.has(name)) db.exec(`ALTER TABLE notes ADD COLUMN ${name} ${type}`);
  }
}

function seed(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) AS c FROM channels").get() as { c: number };
  if (count.c === 0) {
    const insert = db.prepare("INSERT INTO channels (name, description) VALUES (?, ?)");
    insert.run(
      "Sermon Prep",
      "Biblical, theological, and historical topics for teaching and sermons."
    );
    insert.run(
      "Agency",
      "Marketing, technology, AI, and business topics for agency work."
    );
  }
}

export function getDb(): Database.Database {
  if (_db) return _db;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "app.db"));
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  migrate(db);
  try {
    db.exec(FTS_SCHEMA);
    _ftsAvailable = true;
  } catch {
    _ftsAvailable = false; // fall back to LIKE search
  }
  seed(db);
  _db = db;
  return db;
}

export function ftsAvailable(): boolean {
  getDb();
  return _ftsAvailable;
}
