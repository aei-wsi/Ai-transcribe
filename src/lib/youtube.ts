import { getDb } from "./db";
import { detectPlatform } from "./ingest";
import { createNote } from "./notes";

/**
 * YouTube "saves" connector.
 *
 * Note: the YouTube Data API does NOT expose the built-in Watch Later playlist.
 * The reliable equivalents are (a) the user's Liked videos, and (b) a dedicated
 * playlist the user creates (e.g. one named "Transcribe") whose ID is set in
 * YOUTUBE_PLAYLIST_ID. This connector syncs both.
 */

const OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error("GOOGLE_CLIENT_ID is not set.");
  return v;
}
function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error("GOOGLE_CLIENT_SECRET is not set.");
  return v;
}
export function redirectUri(): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}/api/connectors/youtube/callback`;
}

export function isConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function buildAuthUrl(): string {
  const params = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: OAUTH_SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

export async function exchangeCode(code: string): Promise<void> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed (${res.status}): ${await res.text()}`);
  const token = (await res.json()) as TokenResponse;
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  getDb()
    .prepare(
      `INSERT INTO connectors (provider, access_token, refresh_token, expires_at)
       VALUES ('youtube', ?, ?, ?)
       ON CONFLICT(provider) DO UPDATE SET
         access_token = excluded.access_token,
         refresh_token = COALESCE(excluded.refresh_token, connectors.refresh_token),
         expires_at = excluded.expires_at`
    )
    .run(token.access_token, token.refresh_token ?? null, expiresAt);
}

interface ConnectorRow {
  id: number;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  last_synced_at: string | null;
}

export function getConnector(): ConnectorRow | undefined {
  return getDb()
    .prepare("SELECT * FROM connectors WHERE provider = 'youtube'")
    .get() as ConnectorRow | undefined;
}

async function freshAccessToken(connector: ConnectorRow): Promise<string> {
  const expired =
    !connector.expires_at || new Date(connector.expires_at).getTime() < Date.now() + 60_000;
  if (!expired) return connector.access_token;
  if (!connector.refresh_token) {
    throw new Error("YouTube access token expired and no refresh token stored. Reconnect.");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: connector.refresh_token,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${await res.text()}`);
  const token = (await res.json()) as TokenResponse;
  const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  getDb()
    .prepare("UPDATE connectors SET access_token = ?, expires_at = ? WHERE id = ?")
    .run(token.access_token, expiresAt, connector.id);
  return token.access_token;
}

interface SavedVideo {
  videoId: string;
  title: string;
}

async function listLikedVideos(accessToken: string, max = 25): Promise<SavedVideo[]> {
  const params = new URLSearchParams({
    part: "snippet",
    myRating: "like",
    maxResults: String(max),
  });
  const res = await fetch(`${API}/videos?${params}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`YouTube liked-videos fetch failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as {
    items?: { id: string; snippet?: { title?: string } }[];
  };
  return (data.items ?? []).map((v) => ({
    videoId: v.id,
    title: v.snippet?.title ?? v.id,
  }));
}

async function listPlaylistVideos(
  accessToken: string,
  playlistId: string,
  max = 25
): Promise<SavedVideo[]> {
  const params = new URLSearchParams({
    part: "snippet,contentDetails",
    playlistId,
    maxResults: String(max),
  });
  const res = await fetch(`${API}/playlistItems?${params}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`YouTube playlist fetch failed (${res.status}): ${await res.text()}`);
  const data = (await res.json()) as {
    items?: { contentDetails?: { videoId?: string }; snippet?: { title?: string } }[];
  };
  return (data.items ?? [])
    .filter((v) => v.contentDetails?.videoId)
    .map((v) => ({
      videoId: v.contentDetails!.videoId!,
      title: v.snippet?.title ?? v.contentDetails!.videoId!,
    }));
}

/** Pulls new saved videos and enqueues them for transcription. Returns count enqueued. */
export async function syncYouTube(): Promise<number> {
  const connector = getConnector();
  if (!connector) throw new Error("YouTube is not connected yet.");
  const accessToken = await freshAccessToken(connector);

  const videos: SavedVideo[] = await listLikedVideos(accessToken);
  const playlistId = process.env.YOUTUBE_PLAYLIST_ID;
  if (playlistId) videos.push(...(await listPlaylistVideos(accessToken, playlistId)));

  const db = getDb();
  const seen = db.prepare(
    "SELECT 1 FROM seen_items WHERE connector_id = ? AND external_id = ?"
  );
  const markSeen = db.prepare(
    "INSERT OR IGNORE INTO seen_items (connector_id, external_id) VALUES (?, ?)"
  );

  let enqueued = 0;
  const dedupedIds = new Set<string>();
  for (const video of videos) {
    if (dedupedIds.has(video.videoId)) continue;
    dedupedIds.add(video.videoId);
    if (seen.get(connector.id, video.videoId)) continue;
    const url = `https://www.youtube.com/watch?v=${video.videoId}`;
    createNote({ title: video.title, source_url: url, platform: detectPlatform(url) });
    markSeen.run(connector.id, video.videoId);
    enqueued++;
  }
  db.prepare("UPDATE connectors SET last_synced_at = datetime('now') WHERE id = ?").run(
    connector.id
  );
  return enqueued;
}
