// app/api/auth/session/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {

  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;
  const normalizedRole = role?.toLowerCase();

  if (!userId || normalizedRole !== "admin") {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: { id: userId, role: normalizedRole || role },
    role: normalizedRole || role,
  });
}
