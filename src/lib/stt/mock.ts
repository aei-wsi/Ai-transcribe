import type { TranscriptResult } from "../types";

/**
 * Mock provider so the full pipeline (ingest -> transcribe -> enrich -> library)
 * can run end-to-end with zero API keys. Swap to STT_PROVIDER=assemblyai for
 * real transcription.
 */
export async function transcribeWithMock(audioPath: string): Promise<TranscriptResult> {
  const text =
    `This is a mock transcript generated for local development (source file: ${audioPath}). ` +
    "In this talk the speaker explores how communities preserved teachings through oral tradition, " +
    "why written records changed the way ideas spread, and what modern creators can learn from that " +
    "shift when building an audience today. Set STT_PROVIDER=assemblyai in .env to produce real transcripts.";
  return {
    text,
    segments: [
      { startMs: 0, endMs: 15000, speaker: "A", text },
    ],
  };
}
