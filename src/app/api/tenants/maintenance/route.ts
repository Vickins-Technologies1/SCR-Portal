// src/app/api/tenants/maintenance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import { ObjectId } from "mongodb";
import { MaintenanceRequest } from "@/types/maintenance";

export async function GET(req: NextRequest) {
  const csrfHeader = req.headers.get("x-csrf-token");
  if (!csrfHeader || !(await validateCsrfToken(req, csrfHeader))) {
    return NextResponse.json(
      { success: false, message: "Invalid CSRF token" },
      { status: 403 }
    );
  }

  const userId = req.cookies.get("userId")?.value;
  const role = req.cookies.get("role")?.value;

  if (!userId || role !== "tenant") {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 }
    );
  }

  // Parse query params
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "10")));
  const skip = (page - 1) * limit;

  try {
    const { db } = await connectToDatabase();

    const total = await db
      .collection("maintenance_requests")
      .countDocuments({ tenantId: new ObjectId(userId) });

    const requests = await db
      .collection("maintenance_requests")
      .find({ tenantId: new ObjectId(userId) })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const formatted: MaintenanceRequest[] = requests.map((r) => ({
      _id: r._id.toString(),
      title: r.title,
      description: r.description,
      status: r.status,
      urgency: r.urgency,
      date: r.date.toISOString(),
      propertyId: r.propertyId.toString(),
      tenantId: userId,
    }));

    return NextResponse.json(
      {
        success: true,
        data: { requests: formatted },
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/tenants/maintenance error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch requests" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const csrfHeader = req.headers.get("x-csrf-token");
  if (!csrfHeader || !(await validateCsrfToken(req, csrfHeader))) {
    return NextResponse.json(
      { success: false, message: "Invalid CSRF token" },
      { status: 403 }
    );
  }

  const userId = req.cookies.get("userId")?.value;
  const role = req.cookies.get("role")?.value;

  if (!userId || role !== "tenant") {
    return NextResponse.json(
      { success: false, message: "Unauthorized: Tenant access required" },
      { status: 401 }
    );
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON payload" },
      { status: 400 }
    );
  }

  const { title, description, urgency, propertyId } = body;

  if (!title?.trim() || !description?.trim() || !propertyId) {
    return NextResponse.json(
      { success: false, message: "Missing required fields: title, description, propertyId" },
      { status: 400 }
    );
  }

  if (!["low", "medium", "high"].includes(urgency)) {
    return NextResponse.json(
      { success: false, message: "Invalid urgency level" },
      { status: 400 }
    );
  }

  try {
    const { db } = await connectToDatabase();

    // Verify tenant owns this property
    const tenant = await db
      .collection("tenants")
      .findOne({ _id: new ObjectId(userId) });

    if (!tenant || tenant.propertyId.toString() !== propertyId) {
      return NextResponse.json(
        { success: false, message: "Invalid property for this tenant" },
        { status: 403 }
      );
    }

    const newReq = {
      title: title.trim(),
      description: description.trim(),
      status: "Pending" as const,
      urgency: urgency as "low" | "medium" | "high",
      tenantId: new ObjectId(userId),
      propertyId: new ObjectId(propertyId),
      ownerId: tenant.ownerId,
      date: new Date(),
    };

    const result = await db
      .collection("maintenance_requests")
      .insertOne(newReq);

    const inserted: MaintenanceRequest = {
      _id: result.insertedId.toString(),
      title: newReq.title,
      description: newReq.description,
      status: newReq.status,
      urgency: newReq.urgency,
      date: newReq.date.toISOString(),
      propertyId: newReq.propertyId.toString(),
      tenantId: userId,
    };

    return NextResponse.json(
      { success: true, data: inserted },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/tenants/maintenance error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to create request" },
      { status: 500 }
    );
  }
}