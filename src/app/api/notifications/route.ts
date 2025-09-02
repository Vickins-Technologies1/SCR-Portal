import { NextRequest, NextResponse } from "next/server";
import { Db, ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import { connectToDatabase } from "../../../lib/mongodb";
import { validateCsrfToken } from "../../../lib/csrf";
import { sendWelcomeSms } from "../../../lib/sms";
import { sendWhatsAppMessage } from "../../../lib/whatsapp";
import { generateStyledTemplate } from "../../../lib/email-template";
import nodemailer from "nodemailer";
import logger from "../../../lib/logger";
import { Tenant } from "../../../types/tenant";

interface Notification {
  _id: string;
  message: string;
  type: "payment" | "maintenance" | "tenant" | "other";
  createdAt: string;
  status: "unread" | "read";
  tenantId: string;
  tenantName: string;
  ownerId: string;
  deliveryMethod: "app" | "sms" | "email" | "whatsapp" | "both";
  deliveryStatus?: "pending" | "success" | "failed";
  errorDetails?: string | null;
}


const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
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

  logger.debug("Authenticating request", {
    path: req.nextUrl.pathname,
    userId,
    role,
    hasCsrfToken: !!csrfToken,
  });

  if (!userId || role !== "propertyOwner") {
    logger.warn("Unauthorized access attempt", { userId, role });
    return { isValid: false, error: "Unauthorized: Property owner access required", userId: null };
  }
  if (!csrfToken || !(await validateCsrfToken(req, csrfToken))) {
    logger.warn("Invalid or missing CSRF token", { userId, csrfToken });
    return { isValid: false, error: "Invalid or missing CSRF token", userId };
  }
  logger.info("Request authenticated", { userId, role });
  return { isValid: true, userId };
};

const validateTenantOwnership = async (db: Db, tenantId: string, ownerId: string) => {
  if (tenantId === "all") return true;
  try {
    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId,
    });
    logger.debug("Tenant ownership validation", {
      tenantId,
      ownerId,
      found: !!tenant,
    });
    return !!tenant;
  } catch (error) {
    logger.error("Error validating tenant ownership", { tenantId, ownerId, error });
    return false;
  }
};

const sanitizeInput = (input: string): string => {
  return input.replace(/[<>]/g, "");
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { isValid, userId, error } = await authenticatePropertyOwner(req);
    if (!isValid || !userId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get("ownerId");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "100");

    if (ownerId !== userId) {
      logger.warn("Forbidden: Invalid owner ID", { userId, ownerId });
      return NextResponse.json(
        { success: false, message: "Forbidden: Invalid owner ID" },
        { status: 403 }
      );
    }

    const { db } = await connectToDatabase();
    const skip = (page - 1) * limit;
    const notifications = await db
      .collection<Notification>("notifications")
      .find({ ownerId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await db.collection<Notification>("notifications").countDocuments({ ownerId });

    const formattedNotifications = notifications.map((n) => ({
      ...n,
      _id: n._id.toString(),
      tenantId: n.tenantId === "all" ? "all" : n.tenantId,
    }));

    logger.info("Notifications fetched successfully", {
      userId,
      count: formattedNotifications.length,
      page,
      limit,
      total,
    });

    return NextResponse.json({
      success: true,
      data: formattedNotifications,
      total,
      page,
      limit,
    });
  } catch (error) {
    logger.error("Error fetching notifications", { error });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { isValid, userId, error } = await authenticatePropertyOwner(req);
    if (!isValid || !userId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const body = await req.json();
    const { message, tenantId, type, deliveryMethod } = body;

    if (!tenantId || !type || !deliveryMethod) {
      logger.warn("Missing required fields", { userId, tenantId, type, deliveryMethod });
      return NextResponse.json(
        { success: false, message: "Missing required fields: tenantId, type, or deliveryMethod" },
        { status: 400 }
      );
    }

    if (!["payment", "maintenance", "tenant", "other"].includes(type)) {
      logger.warn("Invalid notification type", { userId, type });
      return NextResponse.json(
        { success: false, message: "Invalid notification type" },
        { status: 400 }
      );
    }

    if (!["app", "sms", "email", "whatsapp", "both"].includes(deliveryMethod)) {
      logger.warn("Invalid delivery method", { userId, deliveryMethod });
      return NextResponse.json(
        { success: false, message: "Invalid delivery method" },
        { status: 400 }
      );
    }

    if (!message && type !== "payment") {
      logger.warn("Missing message for non-payment notification", { userId, type });
      return NextResponse.json(
        { success: false, message: "Message is required for non-payment notifications" },
        { status: 400 }
      );
    }

    if (!(await validateTenantOwnership(db, tenantId, userId))) {
      logger.warn("Invalid tenant ID or unauthorized access", { userId, tenantId });
      return NextResponse.json(
        { success: false, message: "Invalid tenant ID or unauthorized access" },
        { status: 403 }
      );
    }

    let tenants: Tenant[] = [];
    if (tenantId === "all") {
      tenants = await db.collection<Tenant>("tenants").find({ ownerId: userId }).toArray();
    } else {
      const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(tenantId) });
      if (tenant) tenants = [tenant];
    }

    if (!tenants.length && tenantId !== "all") {
      logger.warn("Tenant not found", { userId, tenantId });
      return NextResponse.json(
        { success: false, message: "Tenant not found" },
        { status: 404 }
      );
    }

    const notifications: Notification[] = [];

    for (const tenant of tenants) {
      let finalMessage = message ? sanitizeInput(message) : "";
      let effectiveDeliveryMethod = deliveryMethod;
      let deliveryStatus: Notification["deliveryStatus"] = "pending";
      let errorDetails: string | null = null;

      // Respect tenant's deliveryMethod preference unless overridden by "both"
      if (deliveryMethod !== "both" && tenant.deliveryMethod && tenant.deliveryMethod !== "both") {
        effectiveDeliveryMethod = tenant.deliveryMethod;
      }

      if (type === "payment") {
        finalMessage = tenant.price
          ? `Payment of Ksh. ${tenant.price.toFixed(2)} is due for ${tenant.name}`
          : `Payment reminder for ${tenant.name}`;
      } else if (type === "maintenance") {
        finalMessage = finalMessage || "Scheduled maintenance for your property";
      } else if (type === "tenant") {
        finalMessage = finalMessage || "Important tenant update";
      } else {
        finalMessage = finalMessage || "Important information from your property manager";
      }

      if (effectiveDeliveryMethod === "sms" || effectiveDeliveryMethod === "both") {
        if (tenant.phone) {
          try {
            await sendWelcomeSms({
              phone: tenant.phone,
              message: finalMessage.slice(0, 160),
            });
            logger.info("SMS sent successfully", { tenantId: tenant._id.toString(), phone: tenant.phone });
            deliveryStatus = "success";
          } catch (error) {
            logger.error("Failed to send SMS", {
              tenantId: tenant._id.toString(),
              phone: tenant.phone,
              error: error instanceof Error ? error.message : "Unknown error",
            });
            deliveryStatus = "failed";
            errorDetails = error instanceof Error ? error.message : "Failed to send SMS";
          }
        } else {
          logger.warn("No phone number for SMS delivery", { tenantId: tenant._id.toString() });
          deliveryStatus = "failed";
          errorDetails = "No phone number provided for SMS delivery";
        }
      }

      if (effectiveDeliveryMethod === "email" || effectiveDeliveryMethod === "both") {
        if (tenant.email) {
          try {
            const emailTitle =
              type === "payment"
                ? "Payment Reminder"
                : type === "maintenance"
                ? "Maintenance Notification"
                : type === "tenant"
                ? "Tenant Update"
                : "Property Notification";
            const emailIntro =
              type === "payment"
                ? "This is a reminder regarding your rental payment."
                : type === "maintenance"
                ? "We have scheduled maintenance for your property."
                : type === "tenant"
                ? "Important update regarding your tenancy."
                : "Important information from your property manager.";
            const emailDetails = `
              <ul>
                <li><strong>Message:</strong> ${finalMessage}</li>
                <li><strong>Action:</strong> ${
                  type === "payment"
                    ? "Please make your payment at your earliest convenience."
                    : type === "maintenance"
                    ? "Please ensure access to your property or contact us for details."
                    : type === "tenant"
                    ? "Please review the update and contact us if you have questions."
                    : "Please review and contact us if needed."
                }</li>
              </ul>
            `;
            const html = generateStyledTemplate({
              name: tenant.name,
              title: emailTitle,
              intro: emailIntro,
              details: emailDetails,
            });

            await transporter.sendMail({
              from: `"Smart Choice Rental Management" <${process.env.SMTP_USER}>`,
              to: tenant.email,
              subject: emailTitle,
              html,
            });
            logger.info("Email sent successfully", { tenantId: tenant._id.toString(), email: tenant.email });
            deliveryStatus = deliveryStatus !== "failed" ? "success" : "failed";
          } catch (error) {
            logger.error("Failed to send email", {
              tenantId: tenant._id.toString(),
              email: tenant.email,
              error: error instanceof Error ? error.message : "Unknown error",
            });
            deliveryStatus = "failed";
            errorDetails = error instanceof Error ? error.message : "Failed to send email";
          }
        } else {
          logger.warn("No email address for email delivery", { tenantId: tenant._id.toString() });
          deliveryStatus = "failed";
          errorDetails = "No email address provided for email delivery";
        }
      }

      if (effectiveDeliveryMethod === "whatsapp" || effectiveDeliveryMethod === "both") {
        if (tenant.phone) {
          const whatsappSuccess = await sendWhatsAppMessage({
            phone: tenant.phone,
            message: finalMessage,
          });
          if (whatsappSuccess) {
            logger.info("WhatsApp message sent successfully", { tenantId: tenant._id.toString(), phone: tenant.phone });
            deliveryStatus = deliveryStatus !== "failed" ? "success" : "failed";
          } else {
            logger.error("Failed to send WhatsApp message", {
              tenantId: tenant._id.toString(),
              phone: tenant.phone,
              error: process.env.UMS_DEFAULT_DEVICE_ID
                ? "Device not found. Please verify the WhatsApp device ID in your configuration (Error code: 1007)"
                : "WhatsApp device ID is missing. Please configure UMS_DEFAULT_DEVICE_ID in environment variables (Error code: 1007)",
            });
            deliveryStatus = "failed";
            errorDetails = process.env.UMS_DEFAULT_DEVICE_ID
              ? "Device not found. Please verify the WhatsApp device ID in your configuration (Error code: 1007)"
              : "WhatsApp device ID is missing. Please configure UMS_DEFAULT_DEVICE_ID in environment variables (Error code: 1007)";
          }
        } else {
          logger.warn("No phone number for WhatsApp delivery", { tenantId: tenant._id.toString() });
          deliveryStatus = "failed";
          errorDetails = "No phone number provided for WhatsApp delivery";
        }
      }

      const newNotification: Notification = {
        _id: uuidv4(),
        message: finalMessage,
        type,
        createdAt: new Date().toISOString(),
        status: "unread",
        tenantId: tenantId === "all" ? tenant._id.toString() : tenantId,
        tenantName: tenant.name,
        ownerId: userId,
        deliveryMethod: effectiveDeliveryMethod,
        deliveryStatus: effectiveDeliveryMethod === "app" ? "success" : deliveryStatus,
        errorDetails,
      };

      await db.collection<Notification>("notifications").insertOne(newNotification);
      logger.info("Notification created", {
        notificationId: newNotification._id,
        userId,
        tenantId: tenant._id.toString(),
        type,
      });
      notifications.push(newNotification);
    }

    return NextResponse.json({
      success: true,
      data: notifications[0], // Return first notification for simplicity
      message: "Notification created successfully",
    });
  } catch (error) {
    logger.error("Error processing POST request", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { isValid, userId, error } = await authenticatePropertyOwner(req);
    if (!isValid || !userId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const notificationId = searchParams.get("notificationId");

    if (!notificationId) {
      logger.warn("Missing notification ID for deletion", { userId });
      return NextResponse.json(
        { success: false, message: "Notification ID is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const result = await db.collection<Notification>("notifications").deleteOne({
      _id: notificationId,
      ownerId: userId,
    });

    if (result.deletedCount === 0) {
      logger.warn("Notification not found or unauthorized for deletion", { notificationId, userId });
      return NextResponse.json(
        { success: false, message: "Notification not found or unauthorized" },
        { status: 404 }
      );
    }

    logger.info("Notification deleted", { notificationId, userId });
    return NextResponse.json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    logger.error("Error deleting notification", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}