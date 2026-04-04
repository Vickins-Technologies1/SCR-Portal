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
import { sendPaymentReminders } from "../../../../lib/reminders";
import { resolveTenantMonthlyRentForDate } from "../../../../lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";

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
  reminderType?: "fiveDaysBefore" | "paymentDate";
  dueDate?: string;
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

const authenticateUser = async (req: NextRequest) => {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;
  const csrfToken = req.headers.get("X-CSRF-Token");
  const storedCsrfToken = cookieStore.get("csrf-token")?.value;

  logger.debug("Authenticating reminder request", {
    path: req.nextUrl.pathname,
    userId,
    role,
    hasCsrfToken: !!csrfToken,
    csrfTokenMatch: csrfToken === storedCsrfToken,
  });

  if (!userId || !ObjectId.isValid(userId)) {
    logger.warn("Unauthorized access attempt", { userId, role });
    return { isValid: false, error: "Unauthorized: Missing user", userId: null, effectiveOwnerId: null };
  }

  if (!role || !["propertyOwner", "teamMember"].includes(role)) {
    logger.warn("Unauthorized role", { userId, role });
    return { isValid: false, error: "Unauthorized: Property owner access required", userId, effectiveOwnerId: null };
  }

  if (!csrfToken) {
    logger.warn("Missing CSRF token", { userId, path: req.nextUrl.pathname });
    return { isValid: false, error: "Missing CSRF token", userId, effectiveOwnerId: null };
  }

  if (!(await validateCsrfToken(req, csrfToken))) {
    logger.warn("Invalid CSRF token", {
      userId,
      receivedToken: csrfToken,
      expectedToken: storedCsrfToken,
    });
    return { isValid: false, error: "Invalid CSRF token", userId, effectiveOwnerId: null };
  }

  let effectiveOwnerId = userId;

  if (role === "teamMember") {
    const { db } = await connectToDatabase();
    const teamMember = await db.collection("teamMembers").findOne({
      _id: new ObjectId(userId),
      active: true,
    });

    if (!teamMember || !teamMember.ownerId) {
      logger.warn("Team member missing owner", { userId });
      return { isValid: false, error: "Unauthorized: No property owner assigned", userId, effectiveOwnerId: null };
    }

    effectiveOwnerId = teamMember.ownerId.toString();
  }

  return { isValid: true, userId, effectiveOwnerId };
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
    const { isValid, effectiveOwnerId, error } = await authenticateUser(req);
    if (!isValid || !effectiveOwnerId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    const { db } = await connectToDatabase();
    const query: Partial<Notification> = { ownerId: effectiveOwnerId };
    if (type && ["payment", "maintenance", "tenant", "other"].includes(type)) {
      query.type = type as Notification["type"];
    }

    logger.debug("Fetching notifications", { ownerId: effectiveOwnerId, type });

    const notifications = await db
      .collection<Notification>("notifications")
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    const formattedNotifications = notifications.map((n) => ({
      ...n,
      _id: n._id.toString(), // already string, but kept for safety
      tenantId: n.tenantId === "all" ? "all" : n.tenantId,
    }));

    logger.info("Notifications fetched successfully", {
      ownerId: effectiveOwnerId,
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
    const { isValid, effectiveOwnerId, error } = await authenticateUser(req);
    if (!isValid || !effectiveOwnerId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const { pathname } = new URL(req.url);

    const { notificationId, action } = body as { notificationId?: string; action?: string };

    if (notificationId || action === "mark-read" || pathname.includes("mark-read")) {
      if (!notificationId) {
        logger.warn("Missing notification ID for mark-read", { ownerId: effectiveOwnerId });
        return NextResponse.json(
          { success: false, message: "Notification ID is required" },
          { status: 400 }
        );
      }

      const filter: Record<string, unknown> = {
        ownerId: effectiveOwnerId,
      };

      if (ObjectId.isValid(notificationId)) {
        filter.$or = [
          { _id: notificationId },
          { _id: new ObjectId(notificationId) },
        ];
      } else {
        filter._id = notificationId;
      }

      const result = await db.collection<Notification>("notifications").updateOne(
        filter,
        { $set: { status: "read" } }
      );

      if (result.matchedCount === 0) {
        logger.warn("Notification not found or unauthorized for mark-read", {
          notificationId,
          ownerId: effectiveOwnerId,
        });
        return NextResponse.json(
          { success: false, message: "Notification not found or unauthorized" },
          { status: 404 }
        );
      }

      logger.info("Notification marked as read", { notificationId, ownerId: effectiveOwnerId });
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const isAutoTrigger =
      !body ||
      (typeof body === "object" && Object.keys(body as Record<string, unknown>).length === 0) ||
      (body as { trigger?: string }).trigger === "auto" ||
      (body as { auto?: boolean }).auto === true;

    if (isAutoTrigger) {
      const { sent, skipped, notifications } = await sendPaymentReminders({ ownerId: effectiveOwnerId });
      const formatted = notifications.map((notification) => ({
        ...notification,
        _id: notification._id.toString(),
      }));
      return NextResponse.json(
        {
          success: true,
          message: `Sent ${sent} reminder(s), skipped ${skipped}.`,
          data: formatted,
        },
        { status: 200 }
      );
    }

    const { message, tenantId, type, deliveryMethod } = body as {
      message?: string;
      tenantId?: string;
      type?: Notification["type"];
      deliveryMethod?: Notification["deliveryMethod"];
    };

    if (!tenantId) {
      logger.warn("Missing tenant ID", { ownerId: effectiveOwnerId });
      return NextResponse.json(
        { success: false, message: "Tenant ID is required" },
        { status: 400 }
      );
    }

    if (!type || !["payment", "maintenance", "tenant", "other"].includes(type)) {
      logger.warn("Invalid notification type", { ownerId: effectiveOwnerId, type });
      return NextResponse.json(
        { success: false, message: "Valid notification type is required" },
        { status: 400 }
      );
    }

    if (!deliveryMethod || !["app", "sms", "email", "whatsapp", "both"].includes(deliveryMethod)) {
      logger.warn("Invalid delivery method", { ownerId: effectiveOwnerId, deliveryMethod });
      return NextResponse.json(
        { success: false, message: "Valid delivery method is required" },
        { status: 400 }
      );
    }

    if (!message && type !== "payment") {
      logger.warn("Missing message for non-payment notification", { ownerId: effectiveOwnerId, type });
      return NextResponse.json(
        { success: false, message: "Message is required for non-payment notifications" },
        { status: 400 }
      );
    }

    if (!(await validateTenantOwnership(db, tenantId, effectiveOwnerId))) {
      logger.warn("Invalid tenant ID or unauthorized access", { ownerId: effectiveOwnerId, tenantId });
      return NextResponse.json(
        { success: false, message: "Invalid tenant ID or unauthorized access" },
        { status: 403 }
      );
    }

    let tenants: Tenant[] = [];
    if (tenantId === "all") {
      tenants = await db.collection<Tenant>("tenants").find({ ownerId: effectiveOwnerId }).toArray();
    } else {
      const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(tenantId) });
      if (tenant) tenants = [tenant];
    }

    if (!tenants.length && tenantId !== "all") {
      logger.warn("Tenant not found", { ownerId: effectiveOwnerId, tenantId });
      return NextResponse.json(
        { success: false, message: "Tenant not found" },
        { status: 404 }
      );
    }

    const notifications: Notification[] = [];
    const today = new Date();
    const propertyIds = Array.from(new Set(tenants.map((tenant) => tenant.propertyId)));
    const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, propertyIds);

    for (const tenant of tenants) {
      let finalMessage = message ? sanitizeInput(message) : "";
      const tenantName = tenant.name;
      let effectiveDeliveryMethod = deliveryMethod;

      if (deliveryMethod !== "both" && tenant.deliveryMethod && tenant.deliveryMethod !== "both") {
        effectiveDeliveryMethod = tenant.deliveryMethod as Notification["deliveryMethod"];
      }

      if (type === "payment") {
        const effectiveMonthlyRent = resolveTenantMonthlyRentForDate({
          tenant: tenant as any,
          date: today,
          rentOverrideMap,
        });
        finalMessage = effectiveMonthlyRent
          ? `Payment of Ksh. ${effectiveMonthlyRent.toFixed(2)} is due for ${tenant.name}`
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
          } catch (err) {
            logger.error("Failed to send SMS", { tenantId: tenant._id.toString(), phone: tenant.phone, err });
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
              from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
              to: tenant.email,
              subject: emailTitle,
              html,
            });
            logger.info("Email sent successfully", { tenantId: tenant._id.toString(), email: tenant.email });
            if (deliveryStatus !== "failed") deliveryStatus = "success";
          } catch (err) {
            logger.error("Failed to send email", { tenantId: tenant._id.toString(), email: tenant.email, err });
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
            if (deliveryStatus !== "failed") deliveryStatus = "success";
          } catch (err) {
            logger.error("Failed to send WhatsApp message", { tenantId: tenant._id.toString(), phone: tenant.phone, err });
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
        ownerId: effectiveOwnerId,
        deliveryMethod: effectiveDeliveryMethod,
        deliveryStatus: effectiveDeliveryMethod === "app" ? "success" : deliveryStatus,
      };

      await db.collection<Notification>("notifications").insertOne(newNotification);
      logger.info("Notification created", { 
        notificationId: newNotification._id, 
        ownerId: effectiveOwnerId, 
        tenantId: tenant._id.toString(), 
        type 
      });
      notifications.push(newNotification);
    }

    return NextResponse.json({ success: true, data: notifications }, { status: 201 });
  } catch (error) {
    logger.error("Error processing reminders POST request", { error });
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { isValid, effectiveOwnerId, error } = await authenticateUser(req);
    if (!isValid || !effectiveOwnerId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const notificationId = searchParams.get("notificationId");

    if (!notificationId) {
      logger.warn("Missing notification ID for deletion", { ownerId: effectiveOwnerId });
      return NextResponse.json(
        { success: false, message: "Notification ID is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    // _id is string → direct equality
    const filter = {
      _id: notificationId,
      ownerId: effectiveOwnerId,
    };

    const result = await db.collection<Notification>("notifications").deleteOne(filter);

    if (result.deletedCount === 0) {
      logger.warn("Notification not found or unauthorized for deletion", { 
        notificationId, 
        ownerId: effectiveOwnerId 
      });
      return NextResponse.json(
        { success: false, message: "Notification not found or unauthorized" },
        { status: 404 }
      );
    }

    logger.info("Notification deleted", { notificationId, ownerId: effectiveOwnerId });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("Error deleting notification", { error });
    return NextResponse.json(
      { success: false, message: "Failed to delete notification" },
      { status: 500 }
    );
  }
}
