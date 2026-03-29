import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken } from "@/lib/csrf";
import { resolveTenantContext } from "@/lib/impersonation";
import { sendWelcomeSms } from "@/lib/sms";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { sendVacateRequestEmail } from "@/lib/email";

type VacateStatus = "Pending" | "Approved" | "Rejected";

interface VacateRequestDoc {
  _id: ObjectId;
  tenantId: ObjectId;
  ownerId: string;
  propertyId: ObjectId;
  message: string;
  requestedMoveOutDate?: string;
  status: VacateStatus;
  createdAt: Date;
  updatedAt: Date;
  decisionNote?: string;
  decisionAt?: Date;
  tenantName?: string;
  houseNumber?: string;
  unitType?: string;
}

const formatDate = (value?: string) => {
  if (!value) return "Not specified";
  const date = new Date(value);
  return isNaN(date.getTime()) ? value : date.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
};

export async function GET(req: NextRequest) {
  const userId = req.cookies.get("userId")?.value;
  const role = req.cookies.get("role")?.value;
  const isImpersonating = req.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = req.cookies.get("impersonatingTenantId")?.value;

  try {
    const { db } = await connectToDatabase();
    const tenantContext = await resolveTenantContext({
      db,
      userId,
      role,
      isImpersonating,
      impersonatingTenantId,
    });

    if (!tenantContext) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const { tenantId } = tenantContext;

    const requests = await db
      .collection<VacateRequestDoc>("vacate_requests")
      .find({ tenantId: new ObjectId(tenantId) })
      .sort({ createdAt: -1 })
      .toArray();

    const formatted = requests.map((req) => ({
      _id: req._id.toString(),
      tenantId,
      ownerId: req.ownerId,
      propertyId: req.propertyId.toString(),
      message: req.message,
      requestedMoveOutDate: req.requestedMoveOutDate,
      status: req.status,
      createdAt: req.createdAt.toISOString(),
      updatedAt: req.updatedAt?.toISOString?.() || req.createdAt.toISOString(),
      decisionNote: req.decisionNote,
      decisionAt: req.decisionAt ? req.decisionAt.toISOString() : undefined,
      tenantName: req.tenantName,
      houseNumber: req.houseNumber,
      unitType: req.unitType,
    }));

    return NextResponse.json({ success: true, data: { requests: formatted } }, { status: 200 });
  } catch (error) {
    console.error("GET /api/tenants/vacate error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch vacate requests" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const csrfHeader = req.headers.get("x-csrf-token");
  if (!csrfHeader || !(await validateCsrfToken(req, csrfHeader))) {
    return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
  }

  const userId = req.cookies.get("userId")?.value;
  const role = req.cookies.get("role")?.value;
  const isImpersonating = req.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = req.cookies.get("impersonatingTenantId")?.value;

  let body: { message?: string; moveOutDate?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const message = body.message?.trim();
  const moveOutDate = body.moveOutDate?.trim();

  if (!message) {
    return NextResponse.json({ success: false, message: "Message is required" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const tenantContext = await resolveTenantContext({
      db,
      userId,
      role,
      isImpersonating,
      impersonatingTenantId,
    });

    if (!tenantContext) {
      return NextResponse.json(
        { success: false, message: "Unauthorized: Tenant access required" },
        { status: 401 }
      );
    }

    const { tenantId } = tenantContext;

    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId) });
    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    const propertyId = tenant.propertyId ? new ObjectId(tenant.propertyId) : null;
    if (!propertyId) {
      return NextResponse.json({ success: false, message: "Tenant is not linked to a property" }, { status: 400 });
    }

    const now = new Date();
    const newRequest: Omit<VacateRequestDoc, "_id"> = {
      tenantId: new ObjectId(tenantId),
      ownerId: tenant.ownerId,
      propertyId,
      message,
      requestedMoveOutDate: moveOutDate,
      status: "Pending",
      createdAt: now,
      updatedAt: now,
      tenantName: tenant.name,
      houseNumber: tenant.houseNumber,
      unitType: tenant.unitType,
    };

    const result = await db.collection("vacate_requests").insertOne(newRequest as any);

    const property = await db.collection("properties").findOne({ _id: propertyId });
    const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(tenant.ownerId) });

    const propertyName = property?.name || "Property";
    const ownerName = owner?.name || "Property Owner";
    const ownerEmail = owner?.email;
    const ownerPhone = owner?.phone;
    const moveOutLabel = formatDate(moveOutDate);

    const dashboardUrl = `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/property-owner-dashboard`;

    const smsMessageBase = `Vacate request: ${tenant.name} (${tenant.houseNumber || "Unit"}) at ${propertyName}, move-out ${moveOutLabel}. Check dashboard.`;
    const smsMessage = smsMessageBase.length > 160 ? `${smsMessageBase.slice(0, 157)}...` : smsMessageBase;

    const waMessage = [
      `Vacate request from ${tenant.name}`,
      `Property: ${propertyName}`,
      tenant.houseNumber ? `Unit: ${tenant.houseNumber}` : null,
      moveOutDate ? `Preferred move-out: ${moveOutLabel}` : null,
      `Message: ${message}`,
      `Review in dashboard: ${dashboardUrl}`,
    ].filter(Boolean).join("\n");

    try {
      if (ownerEmail) {
        await sendVacateRequestEmail({
          to: ownerEmail,
          ownerName,
          tenantName: tenant.name,
          propertyName,
          houseNumber: tenant.houseNumber,
          moveOutDate: moveOutLabel,
          message,
          dashboardUrl,
        });
      }
    } catch (err) {
      console.error("Vacate email failed:", err);
    }

    try {
      if (ownerPhone) {
        await sendWelcomeSms({ phone: ownerPhone, message: smsMessage });
      }
    } catch (err) {
      console.error("Vacate SMS failed:", err);
    }

    try {
      if (ownerPhone) {
        await sendWhatsAppMessage({ phone: ownerPhone, message: waMessage });
      }
    } catch (err) {
      console.error("Vacate WhatsApp failed:", err);
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          _id: result.insertedId.toString(),
          tenantId,
          ownerId: tenant.ownerId,
          propertyId: tenant.propertyId,
          message,
          requestedMoveOutDate: moveOutDate,
          status: "Pending",
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          tenantName: tenant.name,
          houseNumber: tenant.houseNumber,
          unitType: tenant.unitType,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/tenants/vacate error:", error);
    return NextResponse.json({ success: false, message: "Failed to submit vacate request" }, { status: 500 });
  }
}
