// src/app/api/notifications/reminders/route.ts
import { NextResponse, NextRequest } from "next/server";
import { Db, ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import { sendWelcomeSms } from "../../../../lib/sms";
import { sendWhatsAppMessage } from "../../../../lib/whatsapp";
import { generateStyledTemplate } from "../../../../lib/email-template";
import nodemailer from "nodemailer";
import { connectToDatabase } from "../../../../lib/mongodb";
import { validateCsrfToken } from "../../../../lib/csrf";
import logger from "../../../../lib/logger";
import { Tenant } from "../../../../types/tenant";

interface Notification {
  _id: string;
  message: string;
  type: "payment" | "maintenance" | "tenant" | "other";
  createdAt: string;
  status: "read" | "unread";
  tenantId: string;
  tenantName: string;
  ownerId: string;
  deliveryMethod: "app" | "sms" | "email" | "whatsapp" | "both";
  deliveryStatus?: "pending" | "success" | "failed";
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
  const storedCsrfToken = cookieStore.get("csrfToken")?.value;

  logger.debug("Authenticating request", {
    path: req.nextUrl.pathname,
    userId,
    role,
    hasCsrfToken: !!csrfToken,
    csrfTokenMatch: csrfToken === storedCsrfToken,
  });

  if (!userId || role !== "propertyOwner") {
    logger.warn("Unauthorized access attempt", { userId, role });
    return { isValid: false, error: "Unauthorized: Property owner access required", userId: null };
  }
  if (!csrfToken) {
    logger.warn("Missing CSRF token", { userId, path: req.nextUrl.pathname });
    return { isValid: false, error: "Missing CSRF token", userId };
  }
  if (!(await validateCsrfToken(req, csrfToken))) {
    logger.warn("Invalid CSRF token", {
      userId,
      receivedToken: csrfToken,
      expectedToken: storedCsrfToken,
    });
    return { isValid: false, error: "Invalid CSRF token", userId };
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
    const type = searchParams.get("type");

    const { db } = await connectToDatabase();
    const query: Partial<Notification> = { ownerId: userId };
    if (type && ["payment", "maintenance", "tenant", "other"].includes(type)) {
      query.type = type as Notification["type"];
    }

    logger.debug("Fetching notifications", { userId, type });

    const notifications = await db
      .collection<Notification>("notifications")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    const formattedNotifications = notifications.map((n) => ({
      ...n,
      _id: n._id.toString(),
      tenantId: n.tenantId === "all" ? "all" : n.tenantId,
    }));

    logger.info("Notifications fetched successfully", {
      userId,
      type,
      count: formattedNotifications.length,
    });

    return NextResponse.json({ success: true, data: formattedNotifications }, { status: 200 });
  } catch (error) {
    logger.error("Error fetching notifications", { error });
    return NextResponse.json(
      { success: false, message: "Failed to fetch notifications" },
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
    const { pathname } = new URL(req.url);

    if (pathname.includes("mark-read")) {
      const { notificationId } = body;
      if (!notificationId) {
        logger.warn("Missing notification ID for mark-read", { userId });
        return NextResponse.json(
          { success: false, message: "Notification ID is required" },
          { status: 400 }
        );
      }

      const result = await db.collection<Notification>("notifications").updateOne(
        { _id: notificationId, ownerId: userId },
        { $set: { status: "read" } }
      );

      if (result.matchedCount === 0) {
        logger.warn("Notification not found or unauthorized for mark-read", {
          notificationId,
          userId,
        });
        return NextResponse.json(
          { success: false, message: "Notification not found or unauthorized" },
          { status: 404 }
        );
      }

      logger.info("Notification marked as read", { notificationId, userId });
      return NextResponse.json({ success: true }, { status: 200 });
    } else {
      const { message, tenantId, type, deliveryMethod } = body;

      if (!tenantId) {
        logger.warn("Missing tenant ID", { userId });
        return NextResponse.json(
          { success: false, message: "Tenant ID is required" },
          { status: 400 }
        );
      }

      if (!type || !["payment", "maintenance", "tenant", "other"].includes(type)) {
        logger.warn("Invalid notification type", { userId, type });
        return NextResponse.json(
          { success: false, message: "Valid notification type is required" },
          { status: 400 }
        );
      }

      if (!deliveryMethod || !["app", "sms", "email", "whatsapp", "both"].includes(deliveryMethod)) {
        logger.warn("Invalid delivery method", { userId, deliveryMethod });
        return NextResponse.json(
          { success: false, message: "Valid delivery method is required" },
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
        const tenantName = tenant.name; // Changed from let to const
        let effectiveDeliveryMethod = deliveryMethod;

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

        let deliveryStatus: Notification["deliveryStatus"] = "pending";

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
              logger.error("Failed to send SMS", { tenantId: tenant._id.toString(), phone: tenant.phone, error });
              deliveryStatus = "failed";
            }
          } else {
            logger.warn("No phone number for SMS delivery", { tenantId: tenant._id.toString() });
            deliveryStatus = "failed";
          }
        }

        if (effectiveDeliveryMethod === "email" || effectiveDeliveryMethod === "both") {
          if (tenant.email) {
            try {
              const emailTitle = type === "payment" ? "Payment Reminder" :
                                type === "maintenance" ? "Maintenance Notification" :
                                type === "tenant" ? "Tenant Update" : "Property Notification";
              const emailIntro = type === "payment" ? "This is a reminder regarding your rental payment." :
                                type === "maintenance" ? "We have scheduled maintenance for your property." :
                                type === "tenant" ? "Important update regarding your tenancy." :
                                "Important information from your property manager.";
              const emailDetails = `
                <ul>
                  <li><strong>Message:</strong> ${finalMessage}</li>
                  <li><strong>Action:</strong> ${type === "payment" ? "Please make your payment at your earliest convenience." :
                                              type === "maintenance" ? "Please ensure access to your property or contact us for details." :
                                              type === "tenant" ? "Please review the update and contact us if you have questions." :
                                              "Please review and contact us if needed."}</li>
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
              logger.error("Failed to send email", { tenantId: tenant._id.toString(), email: tenant.email, error });
              deliveryStatus = "failed";
            }
          } else {
            logger.warn("No email address for email delivery", { tenantId: tenant._id.toString() });
            deliveryStatus = "failed";
          }
        }

        if (effectiveDeliveryMethod === "whatsapp" || effectiveDeliveryMethod === "both") {
          if (tenant.phone) {
            try {
              await sendWhatsAppMessage({
                phone: tenant.phone,
                message: finalMessage,
              });
              logger.info("WhatsApp message sent successfully", { tenantId: tenant._id.toString(), phone: tenant.phone });
              deliveryStatus = deliveryStatus !== "failed" ? "success" : "failed";
            } catch (error) {
              logger.error("Failed to send WhatsApp message", { tenantId: tenant._id.toString(), phone: tenant.phone, error });
              deliveryStatus = "failed";
            }
          } else {
            logger.warn("No phone number for WhatsApp delivery", { tenantId: tenant._id.toString() });
            deliveryStatus = "failed";
          }
        }

        const newNotification: Notification = {
          _id: uuidv4(),
          message: finalMessage,
          type,
          createdAt: new Date().toISOString(),
          status: "unread",
          tenantId: tenantId === "all" ? tenant._id.toString() : tenantId,
          tenantName,
          ownerId: userId,
          deliveryMethod: effectiveDeliveryMethod,
          deliveryStatus: effectiveDeliveryMethod === "app" ? "success" : deliveryStatus,
        };

        await db.collection<Notification>("notifications").insertOne(newNotification);
        logger.info("Notification created", { notificationId: newNotification._id, userId, tenantId: tenant._id.toString(), type });
        notifications.push(newNotification);
      }

      return NextResponse.json({ success: true, data: notifications[0] }, { status: 201 });
    }
  } catch (error) {
    logger.error("Error processing POST request", { error });
    return NextResponse.json(
      { success: false, message: "Server error" },
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
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("Error deleting notification", { error });
    return NextResponse.json(
      { success: false, message: "Failed to delete notification" },
      { status: 500 }
    );
  }
}