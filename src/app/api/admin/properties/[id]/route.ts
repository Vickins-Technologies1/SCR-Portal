// src/app/api/admin/properties/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

// Helper: check if request is from authenticated admin
async function isAuthenticatedAdmin(request: NextRequest): Promise<{ authenticated: boolean; errorResponse?: NextResponse }> {
  try {
    const sessionRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/auth/session`, {
      method: "GET",
      headers: {
        // Forward cookies (important!)
        cookie: request.headers.get("cookie") || "",
      },
      credentials: "include",
    });

    if (!sessionRes.ok) {
      return { authenticated: false, errorResponse: NextResponse.json({ success: false, message: "Session check failed" }, { status: 401 }) };
    }

    const sessionData = await sessionRes.json();

    if (!sessionData.authenticated || sessionData.role !== "admin") {
      return { authenticated: false, errorResponse: NextResponse.json({ success: false, message: "Unauthorized: Admin access required" }, { status: 401 }) };
    }

    return { authenticated: true };
  } catch (err) {
    console.error("Session validation error:", err);
    return { authenticated: false, errorResponse: NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 }) };
  }
}

export async function GET(request: NextRequest, context: { params: { id: string } }) {
  const { authenticated, errorResponse } = await isAuthenticatedAdmin(request);
  if (!authenticated) return errorResponse!;

  const { id } = context.params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const property = await db.collection("properties").findOne({ _id: new ObjectId(id) });

    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      property: {
        ...property,
        _id: property._id.toString(),
      },
    });
  } catch (error: unknown) {
    console.error("Property fetch error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, context: { params: { id: string } }) {
  const { authenticated, errorResponse } = await isAuthenticatedAdmin(request);
  if (!authenticated) return errorResponse!;

  const { id } = context.params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { name, ownerId } = body;

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (ownerId !== undefined) updateData.ownerId = ownerId;

    const { db }: { db: Db } = await connectToDatabase();

    const result = await db.collection("properties").findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updateData },
      { returnDocument: "after" }
    );

    if (!result) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      property: {
        ...result,
        _id: result._id.toString(),
      },
    });
  } catch (error: unknown) {
    console.error("Property update error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: { id: string } }) {
  const { authenticated, errorResponse } = await isAuthenticatedAdmin(request);
  if (!authenticated) return errorResponse!;

  const { id } = context.params;

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const result = await db.collection("properties").deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Property deleted successfully" });
  } catch (error: unknown) {
    console.error("Property delete error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}