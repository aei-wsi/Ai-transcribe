import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import fs from "node:fs";
import { MEDIA_DIR } from "./db";

const execFileAsync = promisify(execFile);

export interface MediaInfo {
  title: string;
  author: string | null;
  durationSec: number | null;
  thumbnailUrl: string | null;
}

export function detectPlatform(url: string): string {
  const host = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  })();
  if (host.includes("youtube.com") || host === "youtu.be") return "youtube";
  if (host.includes("tiktok.com")) return "tiktok";
  if (host.includes("instagram.com")) return "instagram";
  if (host === "x.com" || host.includes("twitter.com")) return "x";
  if (host.includes("facebook.com") || host === "fb.watch") return "facebook";
  if (host.includes("soundcloud.com")) return "soundcloud";
  return "other";
}

function extraArgs(): string[] {
  const raw = process.env.YTDLP_EXTRA_ARGS?.trim();
  return raw ? raw.split(/\s+/) : [];
}

async function ytDlp(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync("yt-dlp", [...extraArgs(), ...args], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15 * 60 * 1000,
    });
    return stdout;
  } catch (err) {
    const e = err as NodeJS.ErrnoException & { stderr?: string };
    if (e.code === "ENOENT") {
      throw new Error(
        "yt-dlp is not installed. Install it (e.g. `pip install yt-dlp` or `brew install yt-dlp`) and make sure it is on PATH."
      );
    }
    const detail = (e.stderr || e.message || "").split("\n").slice(-5).join("\n");
    throw new Error(`yt-dlp failed: ${detail}`);
  }
}

export async function fetchMediaInfo(url: string): Promise<MediaInfo> {
  const stdout = await ytDlp(["-J", "--no-playlist", url]);
  const info = JSON.parse(stdout);
  return {
    title: info.title ?? url,
    author: info.uploader ?? info.channel ?? null,
    durationSec: info.duration ? Math.round(info.duration) : null,
    thumbnailUrl: info.thumbnail ?? null,
  };
}

/** Downloads audio for the given URL into MEDIA_DIR; returns the file path. */
export async function downloadAudio(url: string, noteId: number): Promise<string> {
  const outTemplate = path.join(MEDIA_DIR, `note-${noteId}.%(ext)s`);
  await ytDlp([
    "--no-playlist",
    "-f",
    "bestaudio/best",
    "-x",
    "--audio-format",
    "mp3",
    "--audio-quality",
    "5",
    "-o",
    outTemplate,
    url,
  ]);
  const expected = path.join(MEDIA_DIR, `note-${noteId}.mp3`);
  if (fs.existsSync(expected)) return expected;
  const match = fs
    .readdirSync(MEDIA_DIR)
    .find((f) => f.startsWith(`note-${noteId}.`));
  if (!match) throw new Error("Audio download completed but output file not found.");
  return path.join(MEDIA_DIR, match);
}
