import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Db, ObjectId } from "mongodb";

export async function POST(request: NextRequest) {
  try {
    const role = request.cookies.get("role")?.value;
    const adminUserId = request.cookies.get("userId")?.value;

    if (!role || role !== "admin" || !adminUserId || !ObjectId.isValid(adminUserId)) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

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

    const response = NextResponse.json({
      success: true,
      message: "Impersonation started",
      redirect: "/property-owner-dashboard",
    });

    response.cookies.set("adminOriginalUserId", adminUserId, {
      path: "/",
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 3600,
    });

    response.cookies.set("adminOriginalRole", role, {
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

    return response;
  } catch (error) {
    console.error("Admin impersonate owner error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
