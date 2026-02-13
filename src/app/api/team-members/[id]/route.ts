// src/app/api/team-members/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { ObjectId } from "mongodb";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { db } = await connectToDatabase();
    const memberId = params.id;

    const body = await req.json();
    const { ownerId, name, email, phone, role, permissions, active } = body;

    if (!ownerId) {
      return NextResponse.json({ success: false, message: "ownerId required" }, { status: 400 });
    }

    // CSRF & Ownership
    const submittedCsrf = req.headers.get("x-csrf-token") || "";
    const storedCsrf = req.cookies.get("csrf-token")?.value || "";
    if (submittedCsrf !== storedCsrf) {
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    if (sessionUserId !== ownerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection("teamMembers");

    const updateData: any = {
      $set: {
        updatedAt: new Date(),
      },
    };

    if (name !== undefined) updateData.$set.name = name;
    if (email !== undefined) updateData.$set.email = email.toLowerCase();
    if (phone !== undefined) updateData.$set.phone = phone || null;
    if (role !== undefined) updateData.$set.role = role;
    if (permissions !== undefined && Array.isArray(permissions)) {
      updateData.$set.permissions = permissions;
    }
    if (active !== undefined) updateData.$set.active = active;

    const result = await collection.findOneAndUpdate(
      {
        _id: new ObjectId(memberId),
        ownerId: new ObjectId(ownerId),
      },
      updateData,
      { returnDocument: "after" }
    );

    if (!result) {
      return NextResponse.json({ success: false, message: "Member not found or unauthorized" }, { status: 404 });
    }

    const updatedMember = {
      ...result,
      _id: result._id.toString(),
      ownerId: result.ownerId.toString(),
    };

    return NextResponse.json({ success: true, member: updatedMember });
  } catch (error) {
    logger.error("PATCH /api/team-members/[id] failed", { error });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { db } = await connectToDatabase();
    const memberId = params.id;

    // CSRF & Ownership
    const submittedCsrf = req.headers.get("x-csrf-token") || "";
    const storedCsrf = req.cookies.get("csrf-token")?.value || "";
    if (submittedCsrf !== storedCsrf) {
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    const ownerId = req.cookies.get("userId")?.value;
    if (!ownerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection("teamMembers");

    const result = await collection.deleteOne({
      _id: new ObjectId(memberId),
      ownerId: new ObjectId(ownerId),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Member not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("DELETE /api/team-members/[id] failed", { error });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}