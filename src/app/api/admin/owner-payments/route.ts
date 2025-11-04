// src/app/api/admin/owner-payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";

// === DEBUG HELPER ===
const DEBUG = process.env.NODE_ENV === "development";
const debug = (...args: any[]) => {
  if (DEBUG) console.log("[OWNER-PAYMENTS]", ...args);
};
// =====================

interface Payment {
  _id: string;
  amount: number;
  paymentDate: string;
  transactionId: string;
  status: string;
  type?: string;
  tenantName?: string;
  propertyId: string;
  propertyName: string;
}

interface OwnerReport {
  owner: {
    _id: string;
    name: string;
    email: string;
    phone: string;
  };
  properties: string[];
  totalRevenue: number;
  paymentCount: number;
  payments: Payment[];
}

export async function GET(request: NextRequest) {
  const start = Date.now();
  const role = request.cookies.get("role")?.value;
  const { searchParams } = new URL(request.url);
  const ownerId = searchParams.get("ownerId");
  const debugId = ownerId ? `Owner:${ownerId}` : "ALL_OWNERS";

  debug("API CALL START", { ownerId, role, timestamp: new Date().toISOString() });

  if (role !== "admin") {
    debug("UNAUTHORIZED", { role });
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    debug("Connected to MongoDB");

    // === 1. Fetch Owners ===
    const ownerFilter = ownerId ? { _id: new ObjectId(ownerId) } : {};
    debug("Fetching owners with filter:", ownerFilter);

    const owners = await db
      .collection("propertyOwners")
      .find(ownerFilter)
      .project({ _id: 1, name: 1, email: 1, phone: 1 })
      .toArray();

    debug(`Found ${owners.length} owner(s):`, owners.map(o => ({
      id: o._id.toString(),
      email: o.email
    })));

    if (owners.length === 0) {
      debug("No owners found");
      return NextResponse.json({ success: true, reports: [], totalOwners: 0 });
    }

    const ownerIds = owners.map(o => o._id);
    const ownerMap = new Map(owners.map(o => [o._id.toString(), {
      _id: o._id.toString(),
      name: o.name || "N/A",
      email: o.email,
      phone: o.phone || "N/A",
    }]));

    // === 2. Fetch Properties ===
    debug("Fetching properties for owner IDs:", ownerIds.map(id => id.toString()));
    const properties = await db
      .collection("properties")
      .find({ ownerId: { $in: ownerIds } })
      .project({ _id: 1, name: 1, ownerId: 1 })
      .toArray();

    debug(`Found ${properties.length} properties:`, properties.map(p => ({
      id: p._id.toString(),
      name: p.name,
      ownerId: p.ownerId.toString()
    })));

    const propertyIds = properties.map(p => p._id.toString());
    const propertyMap = new Map(properties.map(p => [p._id.toString(), p.name]));

    if (propertyIds.length === 0) {
      debug("No properties found for owners");
      return NextResponse.json({ success: true, reports: [], totalOwners: owners.length });
    }

    // === 3. Fetch Payments ===
    debug(`Fetching payments for ${propertyIds.length} properties...`);
    const payments = await db
      .collection("payments")
      .aggregate([
        { $match: { propertyId: { $in: propertyIds } } },
        {
          $lookup: {
            from: "tenants",
            let: { tid: "$tenantId" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", { $toObjectId: "$$tid" }] } } },
              { $project: { name: 1 } }
            ],
            as: "tenant"
          }
        },
        { $unwind: { path: "$tenant", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            amount: 1,
            paymentDate: 1,
            transactionId: 1,
            status: 1,
            type: 1,
            tenantName: { $ifNull: ["$tenant.name", "Unknown"] },
            propertyId: 1,
          }
        }
      ])
      .toArray();

    debug(`Fetched ${payments.length} payments`);

    // === 4. Group by Owner ===
    const ownerPayments = new Map<string, Payment[]>();

    payments.forEach((p: any) => {
      const prop = properties.find(pr => pr._id.toString() === p.propertyId);
      if (!prop) return;

      const oid = prop.ownerId.toString();
      if (!ownerPayments.has(oid)) ownerPayments.set(oid, []);

      ownerPayments.get(oid)!.push({
        _id: p._id?.toString() || "",
        amount: p.amount,
        paymentDate: p.paymentDate,
        transactionId: p.transactionId,
        status: p.status,
        type: p.type,
        tenantName: p.tenantName,
        propertyId: p.propertyId,
        propertyName: propertyMap.get(p.propertyId) || "Unknown",
      });
    });

    debug("Grouped payments by owner:", Array.from(ownerPayments.keys()));

    // === 5. Build Final Report ===
    const reports: OwnerReport[] = [];
    let grandTotal = 0;
    let grandCount = 0;

    for (const [oid, pays] of ownerPayments.entries()) {
      const owner = ownerMap.get(oid)!;
      const ownerProps = properties
        .filter(p => p.ownerId.toString() === oid)
        .map(p => p.name);

      const revenue = pays.reduce((sum, p) => sum + p.amount, 0);
      grandTotal += revenue;
      grandCount += pays.length;

      reports.push({
        owner: owner,
        properties: ownerProps,
        totalRevenue: revenue,
        paymentCount: pays.length,
        payments: pays,
      });
    }

    debug(`Report built: ${reports.length} owners, KES ${grandTotal.toLocaleString()} total`);

    const duration = Date.now() - start;
    debug(`API CALL END (${duration}ms)`);

    return NextResponse.json({
      success: true,
      reports,
      summary: {
        totalOwners: reports.length,
        totalRevenue: grandTotal,
        totalPayments: grandCount,
        durationMs: duration,
      },
    });

  } catch (error) {
    const duration = Date.now() - start;
    debug("FATAL ERROR", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      duration,
    });

    return NextResponse.json(
      { success: false, message: "Server error", debugId },
      { status: 500 }
    );
  }
}