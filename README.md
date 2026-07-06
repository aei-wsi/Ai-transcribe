# Recall — save-to-transcribe knowledge library

Turn the videos you save on YouTube and social media — plus audio uploads and voice
notes — into a **searchable, topic-tagged knowledge library**. Save something once;
find it again when you're writing a sermon, a pitch, or a campaign.

This is **Phase 1** of the product plan (save-to-transcribe). Later phases add live
meeting notes (local-capture, no bot), phone-call transcription (consent-first), and
CRM sync — see the roadmap below.

## What it does

1. **Ingest** — paste any YouTube / TikTok / Instagram / X / SoundCloud link, upload
   an audio or video file, or connect your YouTube account so your **Liked videos**
   (and an optional dedicated playlist) import automatically.
2. **Transcribe** — audio is extracted with `yt-dlp` and transcribed with
   speaker labels (AssemblyAI; a `mock` provider lets you run everything with zero
   API keys).
3. **Enrich** — Claude generates a summary, key points, quotable moments with
   timestamps (deep-linked back to the source video), topic tags, and files the note
   into the best-fit **channel** (seeded with `Sermon Prep` and `Agency`; edit the
   `channels` table to customize).
4. **Retrieve** — full-text search (SQLite FTS5) across titles, transcripts,
   summaries, and tags, filterable by channel.

## Architecture

```
paste URL ─┐
YouTube sync ──┼→ notes + jobs (SQLite) → worker: yt-dlp → STT provider → Claude enrich
audio upload ─┘                                     │
                          Next.js UI ← FTS5 search ←┘
```

- **Web app**: Next.js (App Router, server actions), single-user for now.
- **Queue**: DB-backed jobs table + a polling worker process — no Redis needed at
  this stage. Retries with exponential backoff (3 attempts).
- **Storage**: SQLite (`data/app.db`, WAL mode) + downloaded audio in `data/media/`.
- **Pluggable STT**: `src/lib/stt/` — `assemblyai` (real) or `mock` (dev). Adding
  Deepgram/Whisper later means one new file implementing `SttProvider`.

## Getting started

Prereqs: Node 20+, and `yt-dlp` + `ffmpeg` on PATH for real link ingestion
(`pip install yt-dlp` / `brew install yt-dlp ffmpeg`).

```bash
npm install
cp .env.example .env      # fill in keys, or leave defaults for mock mode
npm run dev               # terminal 1: web app  → http://localhost:3000
npm run worker            # terminal 2: background transcription worker
```

With the default `.env` (`STT_PROVIDER=mock`, no keys) the full pipeline runs
end-to-end with placeholder transcripts, so you can exercise the app immediately.
For real output set:

- `ASSEMBLYAI_API_KEY` + `STT_PROVIDER=assemblyai` — transcription (~$0.15–0.22/hr of audio)
- `ANTHROPIC_API_KEY` — summaries/quotes/tagging (falls back to a simple heuristic if unset)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — YouTube saves connector

### YouTube connector notes

- The YouTube Data API **does not expose the built-in Watch Later playlist** — this
  is a platform restriction, not a bug. The connector syncs your **Liked videos**
  instead, plus an optional dedicated playlist (`YOUTUBE_PLAYLIST_ID`) — e.g. create
  a playlist called "Transcribe" and save into it.
- Instagram/TikTok do not offer public "saved posts" APIs; for those platforms,
  paste the share link (Share → Copy Link) into the app. A share-sheet mobile
  shortcut is on the roadmap.
- Some content (age-restricted, login-required) needs cookies:
  set `YTDLP_EXTRA_ARGS=--cookies-from-browser chrome`.

## Roadmap

| Phase | Feature | Notes |
|---|---|---|
| 1 (this) | Save-to-transcribe library | URL paste, YouTube sync, upload, search, channels |
| 2 | Voice notes | Quick-capture UI + mobile share sheet; pipeline already supports uploads |
| 3 | Live meetings | Granola-style local audio capture (no bot in the call) + calendar context |
| 4 | Phone calls | Consent-first design only — visible/durable disclosure on every call; see below |
| 5 | CRM sync | Meeting-pipeline notes → Salesforce/HubSpot/Pipedrive |

### A note on call/meeting consent

Anything that captures other people's speech (meetings, phone calls) ships with
disclosure **on by default**: calendar-invite notices, in-call visible indicators,
and/or spoken notice. Wiretap statutes in many US states require all-party consent,
real-time *transcription without recording* is already the subject of active
federal litigation (In re Otter.AI Privacy Litigation), and jurisdiction cannot be
safely user-selected. Design principle: **always disclose, never interrupt** —
disclosure via calendar/visual channels rather than audio interruptions.

## Project layout

```
src/
  lib/
    db.ts          SQLite init, schema, FTS5 index
    notes.ts       note/channel queries + search
    ingest.ts      yt-dlp metadata + audio download
    stt/           pluggable transcription providers (assemblyai, mock)
    enrich.ts      Claude summarization, quotes, tagging, channel routing
    pipeline.ts    fetch → transcribe → enrich stages + job runner
    youtube.ts     Google OAuth + liked/playlist sync
  worker.ts        background job loop (npm run worker)
  app/             Next.js UI + API routes (library, note detail, OAuth callback)
```
