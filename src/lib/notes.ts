import { getDb, ftsAvailable } from "./db";
import type { Channel, Note, NoteStatus } from "./types";

export function listChannels(): Channel[] {
  return getDb().prepare("SELECT * FROM channels ORDER BY id").all() as Channel[];
}

export function getNote(id: number): Note | undefined {
  return getDb().prepare("SELECT * FROM notes WHERE id = ?").get(id) as Note | undefined;
}

export function createNote(fields: {
  title?: string;
  source_url?: string | null;
  platform: string;
  media_path?: string | null;
}): number {
  const db = getDb();
  const result = db
    .prepare(
      "INSERT INTO notes (title, source_url, platform, media_path) VALUES (?, ?, ?, ?)"
    )
    .run(
      fields.title ?? "",
      fields.source_url ?? null,
      fields.platform,
      fields.media_path ?? null
    );
  const noteId = Number(result.lastInsertRowid);
  db.prepare("INSERT INTO jobs (note_id) VALUES (?)").run(noteId);
  return noteId;
}

export function updateNote(id: number, fields: Partial<Note>): void {
  const db = getDb();
  const keys = Object.keys(fields) as (keyof Note)[];
  if (keys.length === 0) return;
  const assignments = keys.map((k) => `${k} = @${k}`).join(", ");
  db.prepare(
    `UPDATE notes SET ${assignments}, updated_at = datetime('now') WHERE id = @__id`
  ).run({ ...fields, __id: id });
  if (fields.status === "ready") reindexNote(id);
}

export function setNoteStatus(id: number, status: NoteStatus, error?: string): void {
  updateNote(id, { status, error: error ?? null });
}

function reindexNote(id: number): void {
  if (!ftsAvailable()) return;
  const db = getDb();
  const note = getNote(id);
  if (!note) return;
  const tags = note.tags_json ? (JSON.parse(note.tags_json) as string[]).join(" ") : "";
  try {
    db.prepare("DELETE FROM notes_fts WHERE rowid = ?").run(id);
    db.prepare(
      "INSERT INTO notes_fts (rowid, title, transcript, summary, tags) VALUES (?, ?, ?, ?, ?)"
    ).run(id, note.title, note.transcript ?? "", note.summary ?? "", tags);
  } catch {
    // index failure should never break the pipeline
  }
}

export function searchNotes(query: string, channelId?: number): Note[] {
  const db = getDb();
  const channelFilter = channelId ? "AND notes.channel_id = ?" : "";
  const trimmed = query.trim();

  if (!trimmed) {
    const sql = `SELECT * FROM notes WHERE 1=1 ${channelFilter.replace("notes.", "")} ORDER BY created_at DESC LIMIT 200`;
    return (channelId
      ? db.prepare(sql).all(channelId)
      : db.prepare(sql).all()) as Note[];
  }

  if (ftsAvailable()) {
    // Quote each token so user input can't break FTS query syntax.
    const match = trimmed
      .split(/\s+/)
      .map((t) => `"${t.replace(/"/g, "")}"`)
      .join(" ");
    try {
      const sql = `
        SELECT notes.* FROM notes_fts
        JOIN notes ON notes.id = notes_fts.rowid
        WHERE notes_fts MATCH ? ${channelFilter}
        ORDER BY rank LIMIT 200`;
      const rows = channelId
        ? db.prepare(sql).all(match, channelId)
        : db.prepare(sql).all(match);
      return rows as Note[];
    } catch {
      // fall through to LIKE
    }
  }

  const like = `%${trimmed}%`;
  const sql = `
    SELECT * FROM notes
    WHERE (title LIKE ? OR transcript LIKE ? OR summary LIKE ?) ${channelFilter.replace("notes.", "")}
    ORDER BY created_at DESC LIMIT 200`;
  const rows = channelId
    ? db.prepare(sql).all(like, like, like, channelId)
    : db.prepare(sql).all(like, like, like);
  return rows as Note[];
}

export function pendingCount(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS c FROM notes WHERE status NOT IN ('ready','error')")
    .get() as { c: number };
  return row.c;
}
