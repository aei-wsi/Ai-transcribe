import { NextRequest, NextResponse } from "next/server";
import { exchangeCode } from "@/lib/youtube";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!code) {
    return NextResponse.json({ error: "Missing ?code from Google OAuth." }, { status: 400 });
  }
  try {
    await exchangeCode(code);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  return NextResponse.redirect(appUrl);
}
