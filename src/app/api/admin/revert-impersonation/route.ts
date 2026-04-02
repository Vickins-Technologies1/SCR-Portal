import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { SESSION_COOKIE_NAME, createSessionToken, getSessionCookieOptions, verifySessionToken } from "@/lib/session";

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;
  const impersonator = session?.impersonator;

  if (!impersonator || impersonator.role !== "admin" || !ObjectId.isValid(impersonator.userId)) {
    return NextResponse.json({ success: false, message: "No admin impersonation session" }, { status: 400 });
  }

  const response = NextResponse.json({
    success: true,
    redirect: "/admin/users",
  });

  const restoredToken = await createSessionToken({
    sub: impersonator.userId,
    role: impersonator.role,
    ownerId: null,
  });
  response.cookies.set("session", restoredToken, getSessionCookieOptions());

  response.cookies.set("userId", impersonator.userId, {
    path: "/",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 3600,
  });

  response.cookies.set("role", "admin", {
    path: "/",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 3600,
  });

  response.cookies.delete("adminOriginalUserId");
  response.cookies.delete("adminOriginalRole");
  response.cookies.delete("adminImpersonating");
  response.cookies.delete("adminImpersonatingOwnerId");
  response.cookies.delete("adminImpersonatingOwnerName");

  return response;
}
