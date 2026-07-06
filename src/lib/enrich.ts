import Anthropic from "@anthropic-ai/sdk";
import type { Channel, KeyQuote, Segment } from "./types";

export interface Enrichment {
  summary: string;
  keyPoints: string[];
  keyQuotes: KeyQuote[];
  tags: string[];
  channelName: string | null;
}

const MAX_TRANSCRIPT_CHARS = 400_000;

function formatTimestamp(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

export function transcriptWithTimestamps(segments: Segment[], plain: string): string {
  if (segments.length === 0) return plain;
  return segments
    .map((seg) => {
      const speaker = seg.speaker ? `Speaker ${seg.speaker}: ` : "";
      return `[${formatTimestamp(seg.startMs)}] ${speaker}${seg.text}`;
    })
    .join("\n");
}

const ENRICHMENT_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description: "2-4 sentence summary of the content, written for future reference.",
    },
    key_points: {
      type: "array",
      items: { type: "string" },
      description: "3-8 bullet points capturing the main ideas.",
    },
    key_quotes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          quote: { type: "string", description: "A verbatim quote worth citing later." },
          at_sec: {
            type: ["integer", "null"],
            description:
              "Seconds into the media where the quote occurs, from the [timestamps], or null if unknown.",
          },
        },
        required: ["quote", "at_sec"],
        additionalProperties: false,
      },
      description: "2-6 quotable moments with timestamps.",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "3-8 short lowercase topic tags.",
    },
    channel: {
      type: ["string", "null"],
      description: "Best-fit channel name from the provided list, or null if none fits.",
    },
  },
  required: ["summary", "key_points", "key_quotes", "tags", "channel"],
  additionalProperties: false,
} as const;

export async function enrich(params: {
  title: string;
  author: string | null;
  transcript: string;
  segments: Segment[];
  channels: Channel[];
}): Promise<Enrichment> {
  if (!process.env.ANTHROPIC_API_KEY) return heuristicEnrichment(params.transcript);

  const client = new Anthropic();
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";

  const channelList = params.channels
    .map((c) => `- "${c.name}": ${c.description}`)
    .join("\n");
  const timestamped = transcriptWithTimestamps(params.segments, params.transcript);
  const clipped =
    timestamped.length > MAX_TRANSCRIPT_CHARS
      ? timestamped.slice(0, MAX_TRANSCRIPT_CHARS) + "\n[transcript truncated]"
      : timestamped;

  const prompt = `You are the enrichment step of a personal knowledge library. The user saves videos and audio to study later (sermon prep, agency/marketing research, etc.). Produce reference notes for this transcript.

Title: ${params.title}
Author: ${params.author ?? "unknown"}

Available channels (pick the single best fit, or null):
${channelList}

Transcript (lines are prefixed with [timestamps]):
${clipped}`;

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    output_config: {
      format: { type: "json_schema", schema: ENRICHMENT_SCHEMA },
    },
    messages: [{ role: "user", content: prompt }],
  });

  if (response.stop_reason === "refusal") return heuristicEnrichment(params.transcript);

  const text = response.content.find((b) => b.type === "text")?.text;
  if (!text) return heuristicEnrichment(params.transcript);

  const parsed = JSON.parse(text) as {
    summary: string;
    key_points: string[];
    key_quotes: { quote: string; at_sec: number | null }[];
    tags: string[];
    channel: string | null;
  };

  return {
    summary: parsed.summary,
    keyPoints: parsed.key_points,
    keyQuotes: parsed.key_quotes.map((q) => ({ quote: q.quote, atSec: q.at_sec })),
    tags: parsed.tags,
    channelName: parsed.channel,
  };
}

/** No-LLM fallback so the pipeline still completes without an Anthropic key. */
function heuristicEnrichment(transcript: string): Enrichment {
  const sentences = transcript
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    summary: sentences.slice(0, 3).join(" "),
    keyPoints: [],
    keyQuotes: [],
    tags: [],
    channelName: null,
  };
}
