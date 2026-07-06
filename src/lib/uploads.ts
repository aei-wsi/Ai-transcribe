import fs from "node:fs";
import path from "node:path";
import { MEDIA_DIR, getDb } from "./db";
import { createNote } from "./notes";

export const AUDIO_EXTENSIONS = new Set([
  ".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac", ".webm", ".mp4", ".mov",
]);

/**
 * Persists an uploaded audio/video file and enqueues it for transcription.
 * Returns the new note id, or null when the file is empty/unsupported.
 */
export async function saveUpload(
  file: File,
  opts: { title?: string; platform: string }
): Promise<number | null> {
  if (file.size === 0) return null;
  const ext = path.extname(file.name).toLowerCase() || ".webm";
  if (!AUDIO_EXTENSIONS.has(ext)) return null;

  getDb(); // ensure data dirs exist
  const noteId = createNote({
    title: opts.title ?? path.basename(file.name, ext),
    platform: opts.platform,
  });
  const mediaPath = path.join(MEDIA_DIR, `note-${noteId}${ext}`);
  fs.writeFileSync(mediaPath, Buffer.from(await file.arrayBuffer()));
  getDb().prepare("UPDATE notes SET media_path = ? WHERE id = ?").run(mediaPath, noteId);
  return noteId;
}
