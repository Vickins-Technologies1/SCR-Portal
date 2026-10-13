// src/app/api/revert-impersonation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { connectToDatabase } from "@/lib/mongodb";

const normalizeManagementType = (value: unknown): "rentals" | "airbnb" => {
  if (typeof value !== "string") return "rentals";
  const normalized = value.trim().toLowerCase();
  return normalized === "airbnb" ? "airbnb" : "rentals";
};

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;
  if (!session?.impersonatedTenantId || session.role !== "propertyOwner") {
    return NextResponse.json({ success: false, message: "No tenant impersonation session" }, { status: 400 });
  }
  const managementType = normalizeManagementType(session.managementType);
  const remainingSessionSeconds = Math.max(
    0,
    (session.preImpersonationExpiresAt || 0) - Math.floor(Date.now() / 1000),
  );
  if (remainingSessionSeconds <= 0) {
    return NextResponse.json({ success: false, message: "Owner session expired" }, { status: 401 });
  }

  const response = NextResponse.json({
    success: true,
    redirect: managementType === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard",
  });

  const restoredToken = await createSessionToken({
    sub: session.sub,
    role: "propertyOwner",
    ownerId: session.ownerId ?? session.sub,
    managementType,
    tier: session.tier ?? null,
    impersonator: session.impersonator ?? null,
  }, remainingSessionSeconds);
  response.cookies.set(SESSION_COOKIE_NAME, restoredToken, getSessionCookieOptions(remainingSessionSeconds));
  response.cookies.delete("impersonatingTenantId");
  response.cookies.delete("isImpersonating");
  const { db } = await connectToDatabase();
  await db.collection("securityAuditEvents").insertOne({
    event: "impersonation.ended",
    actorId: session.impersonator?.userId || session.sub,
    actorRole: session.impersonator?.role || session.role,
    ownerId: session.ownerId || session.sub,
    targetType: "tenant",
    targetId: session.impersonatedTenantId,
    createdAt: new Date().toISOString(),
  });

  return response;
}
