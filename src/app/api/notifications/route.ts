import { NextRequest, NextResponse } from "next/server";
import { Db, ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import { connectToDatabase } from "../../../lib/mongodb";
import { validateCsrfToken } from "../../../lib/csrf";
import { sendWelcomeSms } from "../../../lib/sms"; // Uses BlessedTexts
import { sendWhatsAppMessage } from "../../../lib/whatsapp";
import { generateStyledTemplate } from "../../../lib/email-template";
import nodemailer from "nodemailer";
import logger from "../../../lib/logger";
import { Tenant, ResponseTenant } from "../../../types/tenant";
import { calculateTenantDues, TenantDues, convertTenantToResponse } from "../../../lib/utils";

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

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587", 10),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const authenticatePropertyOwner = async (req: NextRequest) => {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;
  const csrfToken = req.headers.get("X-CSRF-Token");

  if (!userId || role !== "propertyOwner") {
    logger.warn("Unauthorized access attempt", { userId, role });
    return { isValid: false, error: "Unauthorized: Property owner access required", userId: null };
  }
  if (!csrfToken || !(await validateCsrfToken(req, csrfToken))) {
    logger.warn("Invalid or missing CSRF token", { userId });
    return { isValid: false, error: "Invalid CSRF token", userId };
  }
  return { isValid: true, userId };
};

const validateTenantOwnership = async (db: Db, tenantId: string, ownerId: string): Promise<boolean> => {
  if (tenantId === "all") return true;
  const tenant = await db.collection<Tenant>("tenants").findOne({
    _id: new ObjectId(tenantId),
    ownerId,
  });
  return !!tenant;
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { isValid, userId, error } = await authenticatePropertyOwner(req);
    if (!isValid || !userId) return NextResponse.json({ success: false, message: error }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get("ownerId");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    if (ownerId !== userId) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      db.collection<Notification>("notifications")
        .find({ ownerId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection<Notification>("notifications").countDocuments({ ownerId }),
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
  let userId: string;

  try {
    const auth = await authenticatePropertyOwner(req);
    if (!auth.isValid || !auth.userId) {
      return NextResponse.json({ success: false, message: auth.error }, { status: 401 });
    }
    userId = auth.userId;

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

    if (!(await validateTenantOwnership(db, tenantId, userId))) {
      return NextResponse.json({ success: false, message: "Unauthorized tenant access" }, { status: 403 });
    }

    // === FETCH TENANTS ===
    let tenants: Tenant[] = [];
    if (tenantId === "all") {
      tenants = await db.collection<Tenant>("tenants").find({ ownerId: userId }).toArray();
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

    // === PROCESS EACH TENANT ===
    for (const tenant of tenants) {
      let finalMessage = message || "";
      let dues: TenantDues | undefined;
      let deliveryStatus: "success" | "failed" | "pending" = "pending";
      let errorDetails: string | null = null;

      // Generate payment message
      if (type === "payment") {
        dues = await calculateTenantDues(db, tenant, today);
        if (dues.paymentStatus === "up-to-date") {
          logger.info("Skipping up-to-date tenant", { tenantId: tenant._id.toString() });
          continue;
        }
        finalMessage = `Dear ${tenant.name}, overdue: Rent Ksh ${dues.rentDues.toFixed(2)}, Deposit Ksh ${dues.depositDues.toFixed(2)}, Utility Ksh ${dues.utilityDues.toFixed(2)}. Total: Ksh ${dues.totalRemainingDues.toFixed(2)}. Pay now!`;
      } else {
        const templates: Record<string, string> = {
          maintenance: `Dear ${tenant.name}, scheduled maintenance soon. Please allow access.`,
          tenant: `Dear ${tenant.name}, tenancy update: review your agreement.`,
          other: `Dear ${tenant.name}, important notice from Smart Choice.`,
        };
        finalMessage = message || templates[type] || finalMessage;
      }

      const shortMessage = finalMessage.slice(0, 160);
      const effectiveMethod = deliveryMethod === "both" || !tenant.deliveryMethod ? deliveryMethod : tenant.deliveryMethod;

      // === SEND SMS (BlessedTexts) ===
      if (["sms", "both"].includes(effectiveMethod) && tenant.phone) {
        try {
          await sendWelcomeSms({ phone: tenant.phone, message: shortMessage });
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
          const title = type === "payment" ? "Payment Due" : "Property Notice";
          const html = generateStyledTemplate({
            name: tenant.name,
            title,
            intro: `Hello ${tenant.name},`,
            details: `<p>${finalMessage}</p>${dues ? `<ul><li>Rent: Ksh ${dues.rentDues}</li><li>Total Due: Ksh ${dues.totalRemainingDues}</li></ul>` : ""}`,
          });

          await transporter.sendMail({
            from: `"Smart Choice" <${process.env.SMTP_USER}>`,
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
        ownerId: userId,
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

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const auth = await authenticatePropertyOwner(req);
    if (!auth.isValid) return NextResponse.json({ success: false, message: auth.error }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("notificationId");
    if (!id) return NextResponse.json({ success: false, message: "notificationId required" }, { status: 400 });

    const { db } = await connectToDatabase();
    const result = await db.collection("notifications").deleteOne({
      _id: new ObjectId(id),
      ownerId: auth.userId,
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