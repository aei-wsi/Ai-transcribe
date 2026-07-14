import Link from "next/link";
import { notFound } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import { transcriptWithTimestamps } from "@/lib/enrich";
import { getNote, listChannels } from "@/lib/notes";
import type { ActionItem, KeyQuote, Segment } from "@/lib/types";

export const dynamic = "force-dynamic";

function sourceLinkAt(url: string | null, atSec: number | null): string | null {
  if (!url || atSec == null) return url;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtube.com") || u.hostname === "youtu.be") {
      u.searchParams.set("t", `${Math.max(0, Math.floor(atSec))}s`);
      return u.toString();
    }
  } catch {
    /* fall through */
  }
  return url;
}

function fmtDuration(sec: number | null): string | null {
  if (sec == null) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s}s`;
}

export default async function NotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const note = getNote(Number(id));
  if (!note) notFound();

  const channels = listChannels();
  const channel = channels.find((c) => c.id === note.channel_id);
  const tags = note.tags_json ? (JSON.parse(note.tags_json) as string[]) : [];
  const keyPoints = note.key_points_json
    ? (JSON.parse(note.key_points_json) as string[])
    : [];
  const quotes = note.key_quotes_json
    ? (JSON.parse(note.key_quotes_json) as KeyQuote[])
    : [];
  const decisions = note.decisions_json
    ? (JSON.parse(note.decisions_json) as string[])
    : [];
  const actionItems = note.action_items_json
    ? (JSON.parse(note.action_items_json) as ActionItem[])
    : [];
  const segments = note.segments_json
    ? (JSON.parse(note.segments_json) as Segment[])
    : [];
  const processing = note.status !== "ready" && note.status !== "error";

  return (
    <>
      {processing && <AutoRefresh />}
      <p>
        <Link href="/">← Library</Link>
      </p>
      <h1>{note.title || note.source_url || `Note #${note.id}`}</h1>
      <p className="meta">
        {[
          note.author,
          note.platform,
          fmtDuration(note.duration_sec),
          `added ${note.created_at} UTC`,
        ]
          .filter(Boolean)
          .join(" · ")}
        {note.source_url && (
          <>
            {" · "}
            <a href={note.source_url} target="_blank" rel="noreferrer">
              open source
            </a>
          </>
        )}
      </p>
      <div className="row" style={{ margin: "0.5rem 0 1rem" }}>
        {channel && <span className="badge channel">{channel.name}</span>}
        <span className={`badge ${note.status === "ready" ? "ready" : note.status === "error" ? "error" : "working"}`}>
          {note.status}
        </span>
        {tags.map((t) => (
          <span key={t} className="tag">
            {t}
          </span>
        ))}
      </div>

      {note.error && (
        <div className="card">
          <p className="error-text">
            {note.status === "error"
              ? note.error
              : `Retrying after an error — ${note.error}`}
          </p>
        </div>
      )}
      {processing && (
        <p className="meta">
          This note is still being processed ({note.status}). The page refreshes
          automatically. Make sure the worker is running: <code>npm run worker</code>
        </p>
      )}

      {note.summary && (
        <>
          <h2>Summary</h2>
          <p>{note.summary}</p>
        </>
      )}

      {keyPoints.length > 0 && (
        <>
          <h2>Key points</h2>
          <ul>
            {keyPoints.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </>
      )}

      {decisions.length > 0 && (
        <>
          <h2>Decisions</h2>
          <ul>
            {decisions.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </>
      )}

      {actionItems.length > 0 && (
        <>
          <h2>Action items</h2>
          <ul>
            {actionItems.map((a, i) => (
              <li key={i}>
                {a.task}
                {a.owner && <span className="meta"> — {a.owner}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      {quotes.length > 0 && (
        <>
          <h2>Key quotes</h2>
          {quotes.map((q, i) => {
            const link = sourceLinkAt(note.source_url, q.atSec);
            return (
              <blockquote key={i} className="quote">
                “{q.quote}”
                {q.atSec != null && (
                  <span className="meta">
                    {" "}
                    —{" "}
                    {link ? (
                      <a href={link} target="_blank" rel="noreferrer">
                        {Math.floor(q.atSec / 60)}:{String(Math.floor(q.atSec % 60)).padStart(2, "0")}
                      </a>
                    ) : (
                      <>
                        {Math.floor(q.atSec / 60)}:{String(Math.floor(q.atSec % 60)).padStart(2, "0")}
                      </>
                    )}
                  </span>
                )}
              </blockquote>
            );
          })}
        </>
      )}

      {note.transcript && (
        <>
          <h2>Transcript</h2>
          <div className="transcript">
            {segments.length > 0
              ? transcriptWithTimestamps(segments, note.transcript)
              : note.transcript}
          </div>
        </>
      )}
    </>
  );
}
