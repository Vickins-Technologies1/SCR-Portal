import { NextResponse } from "next/server";

export async function GET() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) return NextResponse.json({ success: false }, { status: 500 });
  return NextResponse.json({ success: true, clientId }, { headers: { "Cache-Control": "no-store" } });
}
