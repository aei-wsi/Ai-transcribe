import { getDb } from "./db";
import { enrich } from "./enrich";
import { downloadAudio, fetchMediaInfo } from "./ingest";
import { getNote, listChannels, setNoteStatus, updateNote } from "./notes";
import { getSttProvider } from "./stt";

/** Runs a note through fetch -> transcribe -> enrich. Throws on failure. */
export async function processNote(noteId: number): Promise<void> {
  let note = getNote(noteId);
  if (!note) throw new Error(`Note ${noteId} not found`);

  // Stage 1: fetch media (skipped for direct uploads that already have media)
  let mediaPath = note.media_path;
  if (!mediaPath) {
    if (!note.source_url) throw new Error("Note has neither a source URL nor media.");
    setNoteStatus(noteId, "fetching");
    const info = await fetchMediaInfo(note.source_url);
    updateNote(noteId, {
      title: note.title || info.title,
      author: info.author,
      duration_sec: info.durationSec,
      thumbnail_url: info.thumbnailUrl,
    });
    mediaPath = await downloadAudio(note.source_url, noteId);
    updateNote(noteId, { media_path: mediaPath });
  }

  // Stage 2: transcribe
  setNoteStatus(noteId, "transcribing");
  const stt = getSttProvider();
  const transcript = await stt.transcribe(mediaPath);
  updateNote(noteId, {
    transcript: transcript.text,
    segments_json: JSON.stringify(transcript.segments),
  });

  // Stage 3: enrich
  setNoteStatus(noteId, "enriching");
  note = getNote(noteId)!;
  const channels = listChannels();
  const kind = note.platform === "meeting" ? "meeting" : "media";
  const enrichment = await enrich({
    title: note.title,
    author: note.author,
    transcript: transcript.text,
    segments: transcript.segments,
    channels,
    kind,
  });
  const channel = channels.find((c) => c.name === enrichment.channelName);
  updateNote(noteId, {
    summary: enrichment.summary,
    key_points_json: JSON.stringify(enrichment.keyPoints),
    key_quotes_json: JSON.stringify(enrichment.keyQuotes),
    tags_json: JSON.stringify(enrichment.tags),
    action_items_json: JSON.stringify(enrichment.actionItems),
    decisions_json: JSON.stringify(enrichment.decisions),
    channel_id: channel?.id ?? null,
    status: "ready",
    error: null,
  });
}

const MAX_ATTEMPTS = 3;

/** Claims and runs one pending job. Returns false when the queue is empty. */
export async function runNextJob(): Promise<boolean> {
  const db = getDb();
  const job = db
    .prepare(
      `UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = datetime('now')
       WHERE id = (
         SELECT id FROM jobs
         WHERE status = 'pending' AND run_after <= datetime('now')
         ORDER BY id LIMIT 1
       )
       RETURNING id, note_id, attempts`
    )
    .get() as { id: number; note_id: number; attempts: number } | undefined;
  if (!job) return false;

  try {
    await processNote(job.note_id);
    db.prepare(
      "UPDATE jobs SET status = 'done', updated_at = datetime('now') WHERE id = ?"
    ).run(job.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (job.attempts >= MAX_ATTEMPTS) {
      db.prepare(
        "UPDATE jobs SET status = 'error', last_error = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(message, job.id);
      setNoteStatus(job.note_id, "error", message);
    } else {
      const backoffMin = 2 ** job.attempts; // 2, 4, 8 minutes
      db.prepare(
        `UPDATE jobs SET status = 'pending', last_error = ?,
         run_after = datetime('now', '+' || ? || ' minutes'),
         updated_at = datetime('now') WHERE id = ?`
      ).run(message, backoffMin, job.id);
      setNoteStatus(job.note_id, "queued", `retrying: ${message}`);
    }
  }
  return true;
}
