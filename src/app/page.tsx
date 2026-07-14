import Link from "next/link";
import AutoRefresh from "@/components/AutoRefresh";
import MeetingRecorder from "@/components/MeetingRecorder";
import VoiceRecorder from "@/components/VoiceRecorder";
import { listChannels, pendingCount, searchNotes } from "@/lib/notes";
import { getConnector, isConfigured } from "@/lib/youtube";
import type { Note } from "@/lib/types";
import { addUrl, search, syncYouTubeAction, uploadAudio } from "./actions";

export const dynamic = "force-dynamic";

function statusBadge(note: Note) {
  if (note.status === "ready") return <span className="badge ready">ready</span>;
  if (note.status === "error") return <span className="badge error">error</span>;
  return <span className="badge working">{note.status}…</span>;
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; channel?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const channelId = params.channel ? Number(params.channel) : undefined;
  const channels = listChannels();
  const notes = searchNotes(q, channelId);
  const channelName = (id: number | null) =>
    channels.find((c) => c.id === id)?.name ?? null;
  const processing = pendingCount();
  const youtube = getConnector();

  return (
    <>
      {processing > 0 && <AutoRefresh />}
      <h1>Recall</h1>
      <p className="subtitle">
        Save it once — find it when you teach, write, or pitch.
      </p>

      <div className="card">
        <form action={addUrl} className="row">
          <input
            type="url"
            name="url"
            placeholder="Paste a YouTube / TikTok / Instagram / X link…"
            style={{ flex: "1 1 320px" }}
            required
          />
          <button type="submit">Transcribe</button>
        </form>
        <form action={uploadAudio} className="row" style={{ marginTop: "0.6rem" }}>
          <input type="file" name="file" accept="audio/*,video/*" />
          <button type="submit" className="secondary">
            Upload audio / video
          </button>
        </form>
        <VoiceRecorder />
        <div className="row" style={{ marginTop: "0.6rem" }}>
          {isConfigured() ? (
            youtube ? (
              <form action={syncYouTubeAction} className="row">
                <button type="submit" className="secondary">
                  Sync YouTube saves
                </button>
                <span className="meta">
                  {youtube.last_synced_at
                    ? `last synced ${youtube.last_synced_at} UTC`
                    : "connected — not synced yet"}
                </span>
              </form>
            ) : (
              <a href="/api/connectors/youtube/auth">Connect YouTube →</a>
            )
          ) : (
            <span className="meta">
              Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env to auto-import your
              YouTube saves.
            </span>
          )}
        </div>
      </div>

      <details className="card">
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>
          Record a meeting (local capture — no bot joins the call)
        </summary>
        <p className="meta" style={{ marginTop: "0.5rem" }}>
          Captures the meeting tab&apos;s audio and your mic on this device. Nothing
          joins the call as a participant. You confirm you&apos;ve disclosed recording
          to attendees before it starts.
        </p>
        <MeetingRecorder />
      </details>

      <form action={search} className="row" style={{ margin: "1.25rem 0" }}>
        <input
          type="text"
          name="q"
          placeholder="Search your library…"
          defaultValue={q}
          style={{ flex: "1 1 240px" }}
        />
        <select name="channel" defaultValue={params.channel ?? ""}>
          <option value="">All channels</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button type="submit" className="secondary">
          Search
        </button>
      </form>

      {notes.length === 0 && (
        <p className="meta">
          {q ? "No notes match that search yet." : "Your library is empty — paste a link above to get started."}
        </p>
      )}

      {notes.map((note) => {
        const tags = note.tags_json ? (JSON.parse(note.tags_json) as string[]) : [];
        const channel = channelName(note.channel_id);
        return (
          <div key={note.id} className="card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <Link href={`/notes/${note.id}`} className="note-title">
                {note.title || note.source_url || `Note #${note.id}`}
              </Link>
              <span className="row">
                {channel && <span className="badge channel">{channel}</span>}
                <span className="badge">{note.platform}</span>
                {statusBadge(note)}
              </span>
            </div>
            {note.summary && (
              <p style={{ margin: "0.5rem 0 0.25rem" }}>{note.summary}</p>
            )}
            {note.error && (
              <p className="error-text">
                {note.status === "error" ? note.error : `Retrying — ${note.error}`}
              </p>
            )}
            <div className="row">
              {tags.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
