import { NextRequest, NextResponse } from "next/server";
import { detectPlatform } from "@/lib/ingest";
import { createNote } from "@/lib/notes";
import { saveUpload } from "@/lib/uploads";

/**
 * PWA share_target endpoint. The mobile OS share sheet POSTs here (see
 * public/manifest.webmanifest) with either a media file or a shared URL/text.
 * We enqueue what we can and redirect to the library.
 */
export async function POST(request: NextRequest) {
  const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
  try {
    const form = await request.formData();

    const media = form.get("media");
    if (media instanceof File && media.size > 0) {
      const title = String(form.get("title") ?? "").trim() || undefined;
      await saveUpload(media, { title, platform: "shared" });
      return NextResponse.redirect(appUrl, { status: 303 });
    }

    const haystack = [form.get("url"), form.get("text"), form.get("title")]
      .map((v) => String(v ?? ""))
      .join(" ");
    const match = haystack.match(/https?:\/\/[^\s]+/);
    if (match) {
      createNote({ source_url: match[0], platform: detectPlatform(match[0]) });
    }
  } catch {
    // fall through to redirect; nothing actionable to surface to the OS
  }
  return NextResponse.redirect(appUrl, { status: 303 });
}

// Allow tapping the share URL directly (some launchers issue a GET first).
export async function GET(request: NextRequest) {
  const appUrl = process.env.APP_URL ?? new URL(request.url).origin;
  return NextResponse.redirect(appUrl, { status: 303 });
}
