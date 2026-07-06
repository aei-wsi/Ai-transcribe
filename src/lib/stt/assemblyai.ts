import fs from "node:fs";
import type { Segment, TranscriptResult } from "../types";

const BASE = "https://api.assemblyai.com/v2";

function apiKey(): string {
  const key = process.env.ASSEMBLYAI_API_KEY;
  if (!key) {
    throw new Error(
      "ASSEMBLYAI_API_KEY is not set. Set it in .env or use STT_PROVIDER=mock for local development."
    );
  }
  return key;
}

async function api<T>(pathname: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${pathname}`, {
    ...init,
    headers: {
      authorization: apiKey(),
      ...(init?.body && typeof init.body === "string"
        ? { "content-type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AssemblyAI ${pathname} failed (${res.status}): ${body.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

interface AaiUtterance {
  start: number;
  end: number;
  speaker: string;
  text: string;
}

interface AaiTranscript {
  id: string;
  status: "queued" | "processing" | "completed" | "error";
  text: string | null;
  error?: string;
  utterances?: AaiUtterance[] | null;
}

export async function transcribeWithAssemblyAI(
  audioPath: string
): Promise<TranscriptResult> {
  // 1. Upload the audio file
  const audio = fs.readFileSync(audioPath);
  const upload = await api<{ upload_url: string }>("/upload", {
    method: "POST",
    body: audio,
    headers: { "content-type": "application/octet-stream" },
  });

  // 2. Request a transcript with speaker labels
  const created = await api<AaiTranscript>("/transcript", {
    method: "POST",
    body: JSON.stringify({
      audio_url: upload.upload_url,
      speaker_labels: true,
      language_detection: true,
    }),
  });

  // 3. Poll until done
  let transcript = created;
  const deadline = Date.now() + 60 * 60 * 1000;
  while (transcript.status === "queued" || transcript.status === "processing") {
    if (Date.now() > deadline) throw new Error("AssemblyAI transcription timed out.");
    await new Promise((r) => setTimeout(r, 5000));
    transcript = await api<AaiTranscript>(`/transcript/${created.id}`);
  }
  if (transcript.status === "error") {
    throw new Error(`AssemblyAI transcription failed: ${transcript.error}`);
  }

  const segments: Segment[] = (transcript.utterances ?? []).map((u) => ({
    startMs: u.start,
    endMs: u.end,
    speaker: u.speaker,
    text: u.text,
  }));

  return { text: transcript.text ?? "", segments };
}
