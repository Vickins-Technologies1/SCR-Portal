import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { SESSION_COOKIE_NAME, createSessionToken, getSessionCookieOptions, verifySessionToken } from "@/lib/session";
import { connectToDatabase } from "@/lib/mongodb";

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;
  const impersonator = session?.impersonator;

  if (
    !impersonator ||
    (impersonator.role !== "admin" && impersonator.role !== "adminTeamMember") ||
    !ObjectId.isValid(impersonator.userId)
  ) {
    return NextResponse.json({ success: false, message: "No admin impersonation session" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const activeActor = impersonator.role === "admin"
    ? await db.collection("propertyOwners").findOne({ _id: new ObjectId(impersonator.userId), role: "admin", accountStatus: { $ne: "suspended" } }, { projection: { _id: 1 } })
    : await db.collection("adminTeamMembers").findOne({ _id: new ObjectId(impersonator.userId), role: "adminTeamMember", active: true }, { projection: { _id: 1 } });
  if (!activeActor) return NextResponse.json({ success: false, message: "Administrator session is no longer active" }, { status: 401 });

  const response = NextResponse.json({
    success: true,
    redirect: "/admin/users",
  });

  await db.collection("securityAuditEvents").insertOne({
    event: "impersonation.ended",
    actorId: impersonator.userId,
    actorRole: impersonator.role,
    targetType: "owner",
    targetId: session.sub,
    createdAt: new Date().toISOString(),
  });

  const remainingAdminSeconds = Math.min(
    7 * 24 * 60 * 60,
    Math.max(0, (impersonator.expiresAt || 0) - Math.floor(Date.now() / 1000)),
  );
  if (remainingAdminSeconds <= 0) {
    return NextResponse.json({ success: false, message: "Administrator session expired" }, { status: 401 });
  }
  const restoredToken = await createSessionToken({
    sub: impersonator.userId,
    role: impersonator.role,
    ownerId: null,
  }, remainingAdminSeconds);
  response.cookies.set("session", restoredToken, getSessionCookieOptions(remainingAdminSeconds));

  response.cookies.set("userId", impersonator.userId, {
    path: "/",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 3600,
  });

  response.cookies.set("role", impersonator.role, {
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
  response.cookies.delete("managementType");
  response.cookies.delete("tier");

  return response;
}
