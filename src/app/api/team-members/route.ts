// src/app/api/team-members/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { TeamMember } from "@/types/db";
import { ObjectId } from "mongodb";

export async function GET(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    const ownerIdParam = req.nextUrl.searchParams.get("ownerId");
    if (!ownerIdParam) {
      return NextResponse.json(
        { success: false, message: "ownerId query parameter is required" },
        { status: 400 }
      );
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    if (!sessionUserId || sessionUserId !== ownerIdParam) {
      logger.warn("Unauthorized team members access attempt", { requestedOwner: ownerIdParam });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<TeamMember>("teamMembers");

    const members = await collection
      .find({ ownerId: new ObjectId(ownerIdParam) })
      .sort({ createdAt: -1 })
      .toArray();

    // Convert _id to string for frontend
    const serialized = members.map((m) => ({
      ...m,
      _id: m._id?.toString(),
      ownerId: m.ownerId.toString(),
    }));

    return NextResponse.json({
      success: true,
      members: serialized,
    });
  } catch (error) {
    logger.error("GET /api/team-members failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    const body = await req.json();
    const { ownerId, name, email, phone, role, permissions } = body;

    if (!ownerId || !name || !email || !role) {
      return NextResponse.json(
        { success: false, message: "Missing required fields: ownerId, name, email, role" },
        { status: 400 }
      );
    }

    // CSRF check
    const submittedCsrf = req.headers.get("x-csrf-token") || "";
    const storedCsrf = req.cookies.get("csrf-token")?.value || "";
    if (submittedCsrf !== storedCsrf) {
      logger.warn("CSRF validation failed on team member creation");
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    // Ownership
    const sessionUserId = req.cookies.get("userId")?.value;
    if (!sessionUserId || sessionUserId !== ownerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<TeamMember>("teamMembers");

    // Prevent duplicate email per owner
    const existing = await collection.findOne({
      ownerId: new ObjectId(ownerId),
      email: email.toLowerCase(),
    });

    if (existing) {
      return NextResponse.json(
        { success: false, message: "A team member with this email already exists" },
        { status: 409 }
      );
    }

    const now = new Date();

    const result = await collection.insertOne({
      ownerId: new ObjectId(ownerId),
      name,
      email: email.toLowerCase(),
      phone: phone || undefined,
      role,
      permissions: Array.isArray(permissions) ? permissions : [], // important
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    const newMember = {
      _id: result.insertedId.toString(),
      ownerId,
      name,
      email: email.toLowerCase(),
      phone,
      role,
      permissions: Array.isArray(permissions) ? permissions : [],
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    logger.info(`Team member created`, { memberId: result.insertedId, ownerId });

    return NextResponse.json(
      {
        success: true,
        member: newMember,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("POST /api/team-members failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}