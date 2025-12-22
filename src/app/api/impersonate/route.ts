// src/app/api/impersonate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tenantId, ownerId } = body;

    if (!tenantId || !ownerId || !ObjectId.isValid(tenantId) || !ObjectId.isValid(ownerId)) {
      return NextResponse.json(
        { success: false, message: "Invalid input" },
        { status: 400 }
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

    const response = NextResponse.json({
      success: true,
      message: "Impersonation started",
      redirect: "/tenant-dashboard",
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