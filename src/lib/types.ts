export type NoteStatus =
  | "queued"
  | "fetching"
  | "transcribing"
  | "enriching"
  | "ready"
  | "error";

export interface Segment {
  startMs: number;
  endMs: number;
  speaker: string | null;
  text: string;
}

export interface KeyQuote {
  quote: string;
  /** Timestamp in seconds into the media, when known. */
  atSec: number | null;
}

export interface Note {
  id: number;
  title: string;
  source_url: string | null;
  platform: string;
  author: string | null;
  thumbnail_url: string | null;
  duration_sec: number | null;
  media_path: string | null;
  channel_id: number | null;
  status: NoteStatus;
  error: string | null;
  transcript: string | null;
  segments_json: string | null;
  summary: string | null;
  key_points_json: string | null;
  key_quotes_json: string | null;
  tags_json: string | null;
  created_at: string;
  updated_at: string;
}

export interface Channel {
  id: number;
  name: string;
  description: string;
}

export interface TranscriptResult {
  text: string;
  segments: Segment[];
}
