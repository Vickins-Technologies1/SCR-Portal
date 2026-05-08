import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAccountTier } from "@/lib/tier";
import { getOwnerDueStatus } from "@/lib/billing";
import { createSessionToken, getSessionCookieOptions, SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

type OwnerManagementType = "rentals" | "airbnb";

function normalizeManagementType(value: unknown): OwnerManagementType {
  if (typeof value !== "string") return "rentals";
  const normalized = value.trim().toLowerCase();
  return normalized === "airbnb" ? "airbnb" : "rentals";
}

export async function GET() {
  const cookieStore = await cookies();
  const role = cookieStore.get("role")?.value ?? null;
  const userId = cookieStore.get("userId")?.value ?? null;
  const ownerId = cookieStore.get("ownerId")?.value ?? null;

  const effectiveOwnerId = role === "propertyOwner" ? userId : role === "teamMember" ? ownerId : null;

  if (!effectiveOwnerId || !ObjectId.isValid(effectiveOwnerId)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { db } = await connectToDatabase();
  const owner = await db.collection("propertyOwners").findOne(
    { _id: new ObjectId(effectiveOwnerId), role: "propertyOwner" },
    { projection: { tier: 1 } }
  );

  const dueStatus = await getOwnerDueStatus(db, effectiveOwnerId, new Date());
  const planTier = resolveAccountTier(owner?.tier, "premium");
  const effectiveTier = dueStatus.isDue ? "free" : planTier;

  return NextResponse.json(
    {
      success: true,
      tier: effectiveTier,
      planTier,
      isDue: dueStatus.isDue,
    },
    { status: 200 }
  );
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const role = cookieStore.get("role")?.value ?? null;
  const userId = cookieStore.get("userId")?.value ?? null;

  if (role !== "propertyOwner" || !userId || !ObjectId.isValid(userId)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const desiredTier = typeof body?.tier === "string" ? body.tier.trim().toLowerCase() : "premium";
  if (desiredTier !== "premium") {
    return NextResponse.json({ success: false, message: "Only Premium upgrades are supported." }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const dueStatus = await getOwnerDueStatus(db, userId, new Date());
  if (dueStatus.isDue) {
    return NextResponse.json(
      { success: false, message: "You have an overdue invoice. Please pay your invoice to regain full access." },
      { status: 409 }
    );
  }
  const result = await db.collection("propertyOwners").findOneAndUpdate(
    { _id: new ObjectId(userId), role: "propertyOwner" },
    { $set: { tier: "premium", updatedAt: new Date() } },
    { returnDocument: "after", projection: { tier: 1, managementType: 1 } }
  );

  const owner = result?.value;
  if (!owner) {
    return NextResponse.json({ success: false, message: "Owner not found." }, { status: 404 });
  }

  // Refresh the session cookie so middleware sees the new tier immediately.
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionCookie ? await verifySessionToken(sessionCookie) : null;
  const response = NextResponse.json({ success: true, tier: "premium" }, { status: 200 });

  const refreshedToken = await createSessionToken({
    sub: session?.sub ?? userId,
    role: session?.role ?? "propertyOwner",
    ownerId: session?.ownerId ?? userId,
    managementType: session?.managementType ?? normalizeManagementType(cookieStore.get("managementType")?.value),
    impersonator: session?.impersonator ?? null,
    tier: "premium",
  });
  response.cookies.set(SESSION_COOKIE_NAME, refreshedToken, getSessionCookieOptions());

  response.cookies.set("tier", "premium", {
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 7 * 24 * 60 * 60,
    path: "/",
  });

  return response;
}
