import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../lib/mongodb";
import { ObjectId } from "mongodb";
import { getOwnerDueStatus } from "../../../lib/billing";
import { resolveAccountTier, type AccountTier } from "../../../lib/tier";
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE_NAME, verifySessionToken } from "../../../lib/session";

type OwnerManagementType = "rentals" | "airbnb";

function normalizeManagementType(value: unknown): OwnerManagementType {
  if (typeof value !== "string") return "rentals";
  const normalized = value.trim().toLowerCase();
  return normalized === "airbnb" ? "airbnb" : "rentals";
}

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    const ownerIdCookie = cookieStore.get("ownerId")?.value;

    if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role || "")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const ownerId = role === "propertyOwner" ? userId : (ownerIdCookie || userId);

    if (!ownerId || !ObjectId.isValid(ownerId)) {
      return NextResponse.json({ success: false, message: "Invalid owner ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const now = new Date();
    const dueStatus = await getOwnerDueStatus(db, ownerId, now);

    const owner = await db.collection("propertyOwners").findOne(
      { _id: new ObjectId(ownerId), role: "propertyOwner" },
      { projection: { tier: 1, managementType: 1 } }
    );

    const planTier = resolveAccountTier(owner?.tier, "premium");
    const effectiveTier: AccountTier = dueStatus.isDue ? "free" : planTier;

    const response = NextResponse.json(
      { success: true, ...dueStatus, planTier, effectiveTier },
      { status: 200 }
    );

    // Keep client + middleware aligned with the effective tier (invoice due => free mode).
    response.cookies.set("tier", effectiveTier, {
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60,
      path: "/",
    });

    const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const session = sessionCookie ? await verifySessionToken(sessionCookie) : null;

    if (session) {
      const refreshedToken = await createSessionToken({
        sub: session.sub ?? userId,
        role: session.role ?? role ?? "propertyOwner",
        ownerId: session.ownerId ?? ownerId,
        managementType: session.managementType ?? normalizeManagementType(cookieStore.get("managementType")?.value ?? owner?.managementType),
        tier: effectiveTier,
        impersonator: session.impersonator ?? null,
      });
      response.cookies.set(SESSION_COOKIE_NAME, refreshedToken, getSessionCookieOptions());
    }

    return response;
  } catch (error: unknown) {
    console.error("GET /api/owner-dues error", error);
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
