// src/app/api/impersonate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  try {
    const csrfToken = request.headers.get("x-csrf-token");
    if (!validateCsrfToken(request, csrfToken)) {
      return buildInvalidCsrfResponse(request);
    }

    const body = await request.json();
    const { tenantId } = body;

    if (!tenantId || !ObjectId.isValid(tenantId)) {
      return NextResponse.json(
        { success: false, message: "Invalid input" },
        { status: 400 }
      );
    }

    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = sessionToken ? await verifySessionToken(sessionToken) : null;
    const ownerId = session?.sub;

    if (!session || session.role !== "propertyOwner" || !ownerId || !ObjectId.isValid(ownerId)) {
      return NextResponse.json(
        { success: false, message: "Unauthorized owner" },
        { status: 401 }
      );
    }

    const { db } = await connectToDatabase();

    const owner = await db.collection("propertyOwners").findOne({
      _id: new ObjectId(ownerId),
      role: "propertyOwner",
    });

    if (!owner) {
      return NextResponse.json(
        { success: false, message: "Unauthorized owner" },
        { status: 401 }
      );
    }

    const tenant = await db.collection("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId: ownerId,
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, message: "Tenant not found or not yours" },
        { status: 404 }
      );
    }

    const redirect = tenant.accountType === "airbnb_guest" ? "/airbnb-tenant-dashboard" : "/tenant-dashboard";

    const response = NextResponse.json({
      success: true,
      message: "Impersonation started",
      redirect,
    });

    // Impersonation cookies — must NOT be httpOnly so client-side JS can read them
    response.cookies.set("impersonatingTenantId", tenant._id.toString(), {
      path: "/",
      httpOnly: false, // Critical: allow client-side access for banner & logic
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600, // 1 hour
    });

    response.cookies.set("isImpersonating", "true", {
      path: "/",
      httpOnly: false, // Critical: allow client-side access
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
    });

    return response;
  } catch (error) {
    console.error("Impersonate error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}
