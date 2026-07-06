"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import fs from "node:fs";
import path from "node:path";
import { MEDIA_DIR, getDb } from "@/lib/db";
import { detectPlatform } from "@/lib/ingest";
import { createNote } from "@/lib/notes";
import { syncYouTube } from "@/lib/youtube";

export async function addUrl(formData: FormData): Promise<void> {
  const url = String(formData.get("url") ?? "").trim();
  if (!url) return;
  try {
    new URL(url);
  } catch {
    return;
  }
  createNote({ source_url: url, platform: detectPlatform(url) });
  revalidatePath("/");
}

const AUDIO_EXTENSIONS = new Set([
  ".mp3", ".m4a", ".wav", ".aac", ".ogg", ".flac", ".webm", ".mp4", ".mov",
]);

export async function uploadAudio(formData: FormData): Promise<void> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;
  const ext = path.extname(file.name).toLowerCase() || ".mp3";
  if (!AUDIO_EXTENSIONS.has(ext)) return;

  getDb(); // ensure data dirs exist
  const noteId = createNote({
    title: path.basename(file.name, ext),
    platform: "upload",
  });
  const mediaPath = path.join(MEDIA_DIR, `note-${noteId}${ext}`);
  fs.writeFileSync(mediaPath, Buffer.from(await file.arrayBuffer()));
  getDb().prepare("UPDATE notes SET media_path = ? WHERE id = ?").run(mediaPath, noteId);
  revalidatePath("/");
}

export async function syncYouTubeAction(): Promise<void> {
  await syncYouTube();
  revalidatePath("/");
}

export async function search(formData: FormData): Promise<void> {
  const q = String(formData.get("q") ?? "").trim();
  const channel = String(formData.get("channel") ?? "").trim();
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (channel) params.set("channel", channel);
  redirect(params.size > 0 ? `/?${params}` : "/");
}
