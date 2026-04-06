// src/app/api/notifications/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Db, ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import { connectToDatabase } from "../../../lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../lib/csrf";
import { sendWelcomeSms } from "../../../lib/sms"; // Uses BlessedTexts
import { sendWhatsAppMessage } from "../../../lib/whatsapp";
import { generateStyledTemplate } from "../../../lib/email-template";
import nodemailer from "nodemailer";
import logger from "../../../lib/logger";
import { Tenant } from "../../../types/tenant";
import { calculateTenantDues, TenantDues } from "../../../lib/utils";
import { buildOverrideKey, fetchActiveRentOverridesByPropertyIds, filterOverridesForUnit } from "@/lib/rent-overrides";
import { getPaymentTotalsByTenantIds } from "../../../lib/payment-totals";

interface Notification {
  _id: ObjectId;
  message: string;
  type: "payment" | "maintenance" | "tenant" | "other";
  createdAt: string;
  status: "unread" | "read";
  tenantId: string;
  tenantName: string;
  ownerId: string;
  deliveryMethod: "app" | "sms" | "email" | "whatsapp" | "both";
  deliveryStatus: "pending" | "success" | "failed";
  errorDetails?: string | null;
  dues?: TenantDues;
}

interface PropertyPenaltyConfig {
  _id: ObjectId;
  rentPaymentDate?: number;
  penaltyAmount?: number;
  penaltyFrequency?: "daily" | "weekly";
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const authenticateUser = async (
  req: NextRequest,
  { requireCsrf = true }: { requireCsrf?: boolean } = {}
): Promise<{ isValid: boolean; userId: string | null; effectiveOwnerId: string | null; error?: string; csrfInvalid?: boolean }> => {
  const cookieStore = await cookies();
  const loggedInUserId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;
  const csrfToken = req.headers.get("X-CSRF-Token");

  if (!loggedInUserId || !ObjectId.isValid(loggedInUserId)) {
    logger.warn("Invalid or missing user ID", { loggedInUserId });
    return { isValid: false, userId: null, effectiveOwnerId: null, error: "Invalid user ID" };
  }

  if (!["propertyOwner", "teamMember"].includes(role || "")) {
    logger.warn("Unauthorized role", { loggedInUserId, role });
    return { isValid: false, userId: null, effectiveOwnerId: null, error: "Unauthorized: Invalid role" };
  }

  if (requireCsrf && (!csrfToken || !(await validateCsrfToken(req, csrfToken)))) {
    logger.warn("Invalid or missing CSRF token", { loggedInUserId });
    return { isValid: false, userId: null, effectiveOwnerId: null, error: "Invalid CSRF token", csrfInvalid: true };
  }

  let effectiveOwnerId = loggedInUserId;

  if (role === "teamMember") {
    const { db } = await connectToDatabase();
    const teamMember = await db.collection("teamMembers").findOne({
      _id: new ObjectId(loggedInUserId),
      active: true,
    });

    if (!teamMember || !teamMember.ownerId) {
      logger.error("Team member has no assigned owner", { loggedInUserId });
      return { isValid: false, userId: loggedInUserId, effectiveOwnerId: null, error: "Unauthorized: No property owner assigned" };
    }

    effectiveOwnerId = teamMember.ownerId.toString();
  }

  return { isValid: true, userId: loggedInUserId, effectiveOwnerId };
};

const validateTenantOwnership = async (db: Db, tenantId: string, effectiveOwnerId: string): Promise<boolean> => {
  if (tenantId === "all") return true;
  const tenant = await db.collection<Tenant>("tenants").findOne({
    _id: new ObjectId(tenantId),
    ownerId: effectiveOwnerId,
  });
  return !!tenant;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticateUser(req, { requireCsrf: false });
    if (!auth.isValid || !auth.effectiveOwnerId) {
      if (auth.csrfInvalid) {
        return buildInvalidCsrfResponse(req);
      }
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.error?.includes("CSRF") ? 403 : 401 });
    }

    const { effectiveOwnerId } = auth;

    const { searchParams } = new URL(req.url);
    const ownerIdParam = searchParams.get("ownerId");
    const unreadCountOnly = searchParams.get("unreadCount") === "1";
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    if (ownerIdParam && ownerIdParam !== effectiveOwnerId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { db } = await connectToDatabase();

    if (unreadCountOnly) {
      const unreadCount = await db
        .collection<Notification>("notifications")
        .countDocuments({ ownerId: effectiveOwnerId, status: "unread" });
      return NextResponse.json({ success: true, unreadCount });
    }

    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      db.collection<Notification>("notifications")
        .find({ ownerId: effectiveOwnerId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection<Notification>("notifications").countDocuments({ ownerId: effectiveOwnerId }),
    ]);

    const formatted = notifications.map(n => ({
      ...n,
      _id: n._id.toString(),
      tenantId: n.tenantId === "all" ? "all" : n.tenantId,
    }));

    return NextResponse.json({ success: true, data: formatted, total, page, limit });
  } catch (error) {
    logger.error("GET /notifications failed", { error });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let db: Db;
  let effectiveOwnerId: string;

  try {
    const auth = await authenticateUser(req);
    if (!auth.isValid || !auth.effectiveOwnerId) {
      if (auth.csrfInvalid) {
        return buildInvalidCsrfResponse(req);
      }
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.error?.includes("CSRF") ? 403 : 401 });
    }
    effectiveOwnerId = auth.effectiveOwnerId;

    const body = await req.json();
    const { message, tenantId, type = "other", deliveryMethod = "app" } = body;

    // === VALIDATION ===
    if (!tenantId) return NextResponse.json({ success: false, message: "tenantId is required" }, { status: 400 });
    if (!["payment", "maintenance", "tenant", "other"].includes(type)) {
      return NextResponse.json({ success: false, message: "Invalid type" }, { status: 400 });
    }

    if (!["app", "sms", "email", "whatsapp", "both"].includes(deliveryMethod)) {
      return NextResponse.json({ success: false, message: "Invalid deliveryMethod" }, { status: 400 });
    }

    if (!message && type !== "payment") {
      return NextResponse.json({ success: false, message: "message is required" }, { status: 400 });
    }

    ({ db } = await connectToDatabase());

    if (!(await validateTenantOwnership(db, tenantId, effectiveOwnerId))) {
      return NextResponse.json({ success: false, message: "Unauthorized tenant access" }, { status: 403 });
    }

    // === FETCH TENANTS ===
    let tenants: Tenant[] = [];
    if (tenantId === "all") {
      tenants = await db.collection<Tenant>("tenants").find({ ownerId: effectiveOwnerId }).toArray();
    } else {
      const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(tenantId) });
      if (!tenant) return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
      tenants = [tenant];
    }

    if (tenants.length === 0) {
      return NextResponse.json({ success: true, message: "No tenants to notify" });
    }

    const notifications: Notification[] = [];
    const today = new Date();
    const paymentTotalsByTenant = await getPaymentTotalsByTenantIds(
      db,
      tenants.map((tenant) => tenant._id)
    );
    const propertyIds = Array.from(new Set(tenants.map((tenant) => tenant.propertyId)));
    const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, propertyIds);
    const propertyObjectIds = propertyIds.filter(ObjectId.isValid).map((id) => new ObjectId(id));
    const propertyDocs = await db
      .collection<PropertyPenaltyConfig>("properties")
      .find({ _id: { $in: propertyObjectIds } })
      .toArray();
    const propertyMap = new Map(propertyDocs.map((p) => [p._id.toString(), p]));

    // === PROCESS EACH TENANT ===
    for (const tenant of tenants) {
      let finalMessage = message || "";
      let dues: TenantDues | undefined;
      let deliveryStatus: "success" | "failed" | "pending" = "pending";
      let errorDetails: string | null = null;

      // Generate payment message
      if (type === "payment") {
        const property = propertyMap.get(tenant.propertyId);
        const tenantTotals = paymentTotalsByTenant.get(tenant._id.toString());
        const tenantWithTotals = tenantTotals
          ? {
              ...tenant,
              totalRentPaid: tenantTotals.rentPaid,
              totalDepositPaid: tenantTotals.depositPaid,
              totalUtilityPaid: tenantTotals.utilityPaid,
            }
          : tenant;
        const overrides = filterOverridesForUnit(
          rentOverrideMap.get(buildOverrideKey(tenant.propertyId, tenant.unitType)) ?? [],
          tenant.unitIdentifier
        );
        const overridesOrMap = tenantWithTotals.leasedUnits && tenantWithTotals.leasedUnits.length > 0
          ? rentOverrideMap
          : overrides;
        dues = await calculateTenantDues(db, tenantWithTotals as Tenant, today, overridesOrMap, {
          penaltyAmount: property?.penaltyAmount,
          penaltyFrequency: property?.penaltyFrequency,
          rentPaymentDate: property?.rentPaymentDate,
        });
        if (dues.paymentStatus === "up-to-date") {
          logger.info("Skipping up-to-date tenant", { tenantId: tenant._id.toString() });
          continue;
        }
        finalMessage =
          `Payment Notice for ${tenant.name}:\n` +
          `Outstanding balance as of ${today.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.\n` +
          `Rent: Ksh ${dues.rentDues.toFixed(2)}, Deposit: Ksh ${dues.depositDues.toFixed(2)}, Utility: Ksh ${dues.utilityDues.toFixed(2)}.\n` +
          `Total Due: Ksh ${dues.totalRemainingDues.toFixed(2)}.\n` +
          `Please settle by your scheduled payment date via the tenant portal. If you have already paid, kindly disregard this notice.`;
      } else {
        const templates: Record<string, string> = {
          maintenance: `Maintenance Notice: Dear ${tenant.name}, scheduled maintenance is upcoming. Please allow access during the advised window.`,
          tenant: `Tenancy Update: Dear ${tenant.name}, please review the latest tenancy update in your portal.`,
          other: `Official Notice: Dear ${tenant.name}, this is an important message from Sorana Property Managers.`,
        };
        finalMessage = message || templates[type] || finalMessage;
      }

      const effectiveMethod = deliveryMethod;

      // === SEND SMS (BlessedTexts) ===
      if (["sms", "both"].includes(effectiveMethod) && tenant.phone) {
        try {
          await sendWelcomeSms({ phone: tenant.phone, message: finalMessage });
          deliveryStatus = "success";
          logger.info("SMS sent", { phone: tenant.phone });
        } catch (err: any) {
          deliveryStatus = "failed";
          errorDetails = err.message || "SMS failed";
          logger.error("SMS failed", { phone: tenant.phone, error: err.message });
        }
      }

      // === SEND EMAIL ===
      if (["email", "both"].includes(effectiveMethod) && tenant.email) {
        try {
          const title =
            type === "payment" ? "Payment Notice" :
            type === "maintenance" ? "Maintenance Notice" :
            type === "tenant" ? "Tenancy Update" :
            "Official Notice";
          const intro =
            type === "payment"
              ? "This is an official payment notice from Sorana Property Managers."
              : "This is an official notice from Sorana Property Managers.";
          const html = generateStyledTemplate({
            name: tenant.name,
            title,
            intro,
            details: `
              <p>${finalMessage.replace(/\n/g, "<br />")}</p>
              ${
                dues
                  ? `<ul>
                      <li><strong>Rent:</strong> Ksh ${dues.rentDues.toFixed(2)}</li>
                      <li><strong>Deposit:</strong> Ksh ${dues.depositDues.toFixed(2)}</li>
                      <li><strong>Utility:</strong> Ksh ${dues.utilityDues.toFixed(2)}</li>
                      <li><strong>Total Due:</strong> Ksh ${dues.totalRemainingDues.toFixed(2)}</li>
                    </ul>`
                  : ""
              }
            `,
          });

          await transporter.sendMail({
            from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
            to: tenant.email,
            subject: title,
            html,
          });
          if (deliveryStatus !== "failed") deliveryStatus = "success";
        } catch (err: any) {
          deliveryStatus = "failed";
          errorDetails = err.message;
          logger.error("Email failed", { email: tenant.email, error: err.message });
        }
      }

      // === SEND WHATSAPP ===
      if (["whatsapp", "both"].includes(effectiveMethod) && tenant.phone) {
        logger.debug("Attempting WhatsApp delivery", { 
          phone: tenant.phone, 
          tenantId: tenant._id.toString(),
          messageLength: finalMessage.length 
        });

        const waResult = await sendWhatsAppMessage({ 
          phone: tenant.phone, 
          message: finalMessage 
        });

        if (waResult.success) {
          logger.info("WhatsApp message sent successfully", { 
            phone: tenant.phone, 
            tenantName: tenant.name 
          });
          if (deliveryStatus !== "failed") deliveryStatus = "success";
        } else {
          const waError = waResult.error?.message || "Unknown WhatsApp error";
          const waCode = waResult.error?.code || 0;

          logger.error("WhatsApp delivery failed", { 
            phone: tenant.phone, 
            tenantName: tenant.name,
            error: waError,
            code: waCode
          });

          deliveryStatus = "failed";
          errorDetails = `WhatsApp failed: ${waError}${waCode ? ` (Code: ${waCode})` : ""}`;
        }
      }

      // === SAVE NOTIFICATION ===
      const notification: Notification = {
        _id: new ObjectId(),
        message: finalMessage,
        type,
        createdAt: new Date().toISOString(),
        status: "unread",
        tenantId: tenantId === "all" ? tenant._id.toString() : tenantId,
        tenantName: tenant.name,
        ownerId: effectiveOwnerId,
        deliveryMethod: effectiveMethod,
        deliveryStatus: effectiveMethod === "app" ? "success" : deliveryStatus,
        errorDetails,
        dues: type === "payment" ? dues : undefined,
      };

      await db.collection("notifications").insertOne(notification);
      notifications.push(notification);
    }

    if (notifications.length === 0) {
      return NextResponse.json({
        success: true,
        message: "No notifications sent — all tenants up to date",
        data: [],
      });
    }

    return NextResponse.json({
      success: true,
      message: `Sent ${notifications.length} notification(s)`,
      data: {
        notifications: notifications.map(n => ({
          ...n,
          _id: n._id,
          tenantId: n.tenantId === "all" ? "all" : n.tenantId,
        })),
        count: notifications.length,
      },
    });

  } catch (error: any) {
    logger.error("POST /notifications failed", { error: error.message, stack: error.stack });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticateUser(req);
    if (!auth.isValid || !auth.effectiveOwnerId) {
      if (auth.csrfInvalid) {
        return buildInvalidCsrfResponse(req);
      }
      return NextResponse.json(
        { success: false, message: auth.error },
        { status: auth.error?.includes("CSRF") ? 403 : 401 }
      );
    }

    const { effectiveOwnerId } = auth;
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const { notificationId } = body as { notificationId?: string };

    if (!notificationId) {
      return NextResponse.json(
        { success: false, message: "Notification ID is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const filter: Record<string, unknown> = { ownerId: effectiveOwnerId };

    if (ObjectId.isValid(notificationId)) {
      filter.$or = [{ _id: new ObjectId(notificationId) }, { _id: notificationId }];
    } else {
      filter._id = notificationId;
    }

    const result = await db
      .collection<Notification>("notifications")
      .updateOne(filter, { $set: { status: "read" } });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, message: "Notification not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("PATCH /notifications failed", { error });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticateUser(req);
    if (!auth.isValid || !auth.effectiveOwnerId) {
      if (auth.csrfInvalid) {
        return buildInvalidCsrfResponse(req);
      }
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.error?.includes("CSRF") ? 403 : 401 });
    }

    const { effectiveOwnerId } = auth;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("notificationId");
    if (!id) return NextResponse.json({ success: false, message: "notificationId required" }, { status: 400 });

    const { db } = await connectToDatabase();
    const result = await db.collection("notifications").deleteOne({
      _id: new ObjectId(id),
      ownerId: effectiveOwnerId,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Deleted" });
  } catch (error: any) {
    logger.error("DELETE failed", { error });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
