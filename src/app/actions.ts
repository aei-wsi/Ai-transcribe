"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { detectPlatform } from "@/lib/ingest";
import { createNote } from "@/lib/notes";
import { saveUpload } from "@/lib/uploads";
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

export async function uploadAudio(formData: FormData): Promise<void> {
  const file = formData.get("file");
  if (!(file instanceof File)) return;
  await saveUpload(file, { platform: "upload" });
  revalidatePath("/");
}

/** Receives a recorded voice note (blob) from the in-browser recorder. */
export async function recordVoiceNote(formData: FormData): Promise<void> {
  const file = formData.get("audio");
  if (!(file instanceof File)) return;
  const title = String(formData.get("title") ?? "").trim() || undefined;
  await saveUpload(file, { title, platform: "voice-note" });
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
