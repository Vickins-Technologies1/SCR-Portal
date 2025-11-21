// src/app/api/property-owners/maintenance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import { ObjectId } from "mongodb";
import { MaintenanceRequest } from "@/types/maintenance";

interface Tenant {
  _id: ObjectId;
  name: string;
}

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

  if (!userId || role !== "propertyOwner") {
    return NextResponse.json(
      { success: false, message: "Unauthorized: Property owner access required" },
      { status: 401 }
    );
  }

  try {
    const { db } = await connectToDatabase();

    const requests = await db
      .collection("maintenance_requests")
      .find({ ownerId: new ObjectId(userId) })
      .sort({ date: -1 })
      .toArray();

    // Extract unique tenant IDs
    const tenantIds = [...new Set(requests.map((r) => r.tenantId.toString()))];
    const tenants: Tenant[] =
      tenantIds.length > 0
        ? await db
            .collection<Tenant>("tenants")
            .find({ _id: { $in: tenantIds.map((id) => new ObjectId(id)) } })
            .toArray()
        : [];

    const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t.name]));

    const formatted: MaintenanceRequest[] = requests.map((r) => ({
      _id: r._id.toString(),
      title: r.title,
      description: r.description,
      status: r.status,
      urgency: r.urgency,
      date: r.date.toISOString(),
      propertyId: r.propertyId.toString(),
      tenantId: r.tenantId.toString(),
      tenantName: tenantMap.get(r.tenantId.toString()) || "Unknown Tenant",
      ownerId: r.ownerId.toString(),
    }));

    return NextResponse.json(
      { success: true, data: { requests: formatted } },
      { status: 200 }
    );
  } catch (error) {
    console.error("GET /api/property-owners/maintenance error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch requests" },
      { status: 500 }
    );
  }
}