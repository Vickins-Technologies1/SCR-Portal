// src/app/api/property-owners/maintenance/route.ts

import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import { ObjectId } from "mongodb";

interface TenantDoc {
  _id: ObjectId;
  name: string;
}

export async function GET(req: NextRequest) {
  const csrfHeader = req.headers.get("x-csrf-token");
  if (!csrfHeader || !(await validateCsrfToken(req, csrfHeader))) {
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  const userId = req.cookies.get("userId")?.value;
  const role = req.cookies.get("role")?.value;

  if (!userId || role !== "propertyOwner") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();

    // CRITICAL FIX: Accept both string and ObjectId
    let ownerIdQuery: any = userId;
    if (ObjectId.isValid(userId)) {
      ownerIdQuery = { $in: [userId, new ObjectId(userId)] }; // match both!
    }

    const requests = await db
      .collection("maintenance_requests")
      .find({ ownerId: ownerIdQuery })
      .sort({ date: -1 })
      .toArray();

    if (requests.length === 0) {
      console.log("No requests found for ownerId:", userId);
      return NextResponse.json({ success: true, data: { requests: [] } });
    }

    // Get tenant names
    const tenantIds = [...new Set(requests.map(r => r.tenantId.toString()))];
    const tenants: TenantDoc[] = tenantIds.length > 0
      ? (await db.collection("tenants").find({
          _id: { $in: tenantIds.map(id => new ObjectId(id)) }
        }).toArray()) as TenantDoc[]
      : [];

    const tenantMap = new Map(tenants.map(t => [t._id.toString(), t.name]));

    const formatted = requests.map(r => ({
      _id: r._id.toString(),
      title: r.title,
      description: r.description,
      status: r.status,
      urgency: r.urgency,
      date: r.date.toISOString(),
      propertyId: r.propertyId.toString(),
      tenantId: r.tenantId.toString(),
      tenantName: tenantMap.get(r.tenantId.toString()) || "Unknown Tenant",
    }));

    return NextResponse.json(
      { success: true, data: { requests: formatted } },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Owner maintenance fetch error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error" },
      { status: 500 }
    );
  }
}