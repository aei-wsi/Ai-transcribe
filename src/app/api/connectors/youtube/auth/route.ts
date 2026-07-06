import { NextResponse } from "next/server";
import { buildAuthUrl, isConfigured } from "@/lib/youtube";

export async function GET() {
  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first." },
      { status: 400 }
    );
  }
  return NextResponse.redirect(buildAuthUrl());
}
