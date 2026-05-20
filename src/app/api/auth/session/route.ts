// app/api/auth/session/route.ts
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {

  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;

  if (!userId || !role || (role !== "admin" && role !== "adminTeamMember")) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  return NextResponse.json({
    authenticated: true,
    user: { id: userId, role },
    role,
  });
}
