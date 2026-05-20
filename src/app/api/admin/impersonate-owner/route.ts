import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { createSessionToken, getSessionCookieOptions } from "@/lib/session";
import { resolveAccountTier } from "@/lib/tier";
import { getOwnerDueStatus } from "@/lib/billing";
import { requireAdmin } from "@/lib/admin-auth";

type OwnerManagementType = "rentals" | "airbnb";

const normalizeManagementType = (value: unknown): OwnerManagementType => {
  if (typeof value !== "string") return "rentals";
  const normalized = value.trim().toLowerCase();
  return normalized === "airbnb" ? "airbnb" : "rentals";
};

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "admin:impersonation:manage");
    if (auth instanceof NextResponse) return auth;
    const adminUserId = auth.userId;

    const body = await request.json();
    const { ownerId } = body || {};

    if (!ownerId || !ObjectId.isValid(ownerId)) {
      return NextResponse.json({ success: false, message: "Invalid ownerId" }, { status: 400 });
    }

    const { db }: { db: Db } = await connectToDatabase();

    const admin = await db.collection("propertyOwners").findOne({
      _id: new ObjectId(adminUserId),
      role: "admin",
    });

    if (!admin) {
      return NextResponse.json({ success: false, message: "Unauthorized admin" }, { status: 401 });
    }

    const owner = await db.collection("propertyOwners").findOne({
      _id: new ObjectId(ownerId),
      role: "propertyOwner",
    });

    if (!owner) {
      return NextResponse.json({ success: false, message: "Owner not found" }, { status: 404 });
    }

    const managementType = normalizeManagementType(owner.managementType);
    const redirectPath = managementType === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard";
    const planTier = resolveAccountTier(owner?.tier, "premium");
    const dueStatus = await getOwnerDueStatus(db, owner._id.toString(), new Date());
    const ownerTier = dueStatus.isDue ? "free" : planTier;

    const response = NextResponse.json({
      success: true,
      message: "Impersonation started",
      redirect: redirectPath,
    });

    const impersonationToken = await createSessionToken({
      sub: owner._id.toString(),
      role: "propertyOwner",
      ownerId: owner._id.toString(),
      managementType,
      tier: ownerTier,
      impersonator: { userId: adminUserId, role: auth.role },
    });
    response.cookies.set("session", impersonationToken, getSessionCookieOptions());

    response.cookies.set("managementType", managementType, {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
    });

    response.cookies.set("adminOriginalUserId", adminUserId, {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
    });

    response.cookies.set("adminOriginalRole", auth.role, {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
    });

    response.cookies.set("adminImpersonating", "true", {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
    });

    response.cookies.set("adminImpersonatingOwnerId", owner._id.toString(), {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
    });

    response.cookies.set("adminImpersonatingOwnerName", owner.name || "Owner", {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
    });

    response.cookies.set("userId", owner._id.toString(), {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
    });

    response.cookies.set("role", "propertyOwner", {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
    });

    response.cookies.set("tier", ownerTier, {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
    });

    return response;
  } catch (error) {
    console.error("Admin impersonate owner error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
