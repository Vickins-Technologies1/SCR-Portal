import { NextRequest, NextResponse } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";
import { validateCsrfToken } from "../../../lib/csrf";
import { sendWelcomeSms } from "../../../lib/sms";
import { generateStyledTemplate } from "../../../lib/email-template";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";
import logger from "../../../lib/logger";

// MongoDB connection
const connectToDatabase = async (): Promise<Db> => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  await client.connect();
  logger.info("Connected to MongoDB database: rentaldb");
  return client.db("rentaldb");
};

// Nodemailer transporter for email delivery
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Interfaces
interface Tenant {
  _id: ObjectId;
  name: string;
  propertyId: string;
  ownerId: string;
  price?: number;
  status: string;
  paymentStatus: string;
  phone: string;
  email: string;
  deliveryMethod?: "app" | "sms" | "email" | "both";
}

interface Notification {
  _id: string;
  message: string;
  type: "payment" | "maintenance" | "tenant" | "other";
  createdAt: string;
  status: "read" | "unread";
  tenantId: string;
  tenantName: string;
  ownerId: string;
  deliveryMethod: "app" | "sms" | "email" | "both";
  deliveryStatus?: "pending" | "success" | "failed";
}

// Authentication with CSRF validation
const authenticatePropertyOwner = async (req: NextRequest) => {
  const userId = req.cookies.get("userId")?.value;
  const role = req.cookies.get("role")?.value;
  const csrfToken = req.headers.get("x-csrf-token");

  logger.debug("Authenticating request", {
    path: req.nextUrl.pathname,
    userId,
    role,
    hasCsrfToken: !!csrfToken,
    storedCsrfToken: req.cookies.get("csrf-token")?.value,
    receivedCsrfToken: csrfToken,
  });

  if (!userId || role !== "propertyOwner") {
    logger.warn("Unauthorized access attempt", { userId, role });
    return { isValid: false, error: "Unauthorized: Property owner access required", userId: null };
  }

  if (!validateCsrfToken(req, csrfToken)) {
    logger.warn("Invalid or missing CSRF token", {
      userId,
      receivedToken: csrfToken,
      expectedToken: req.cookies.get("csrf-token")?.value,
    });
    return { isValid: false, error: "Invalid or missing CSRF token", userId };
  }

  logger.info("Request authenticated", { userId, role });
  return { isValid: true, userId };
};

// Validate tenant ownership
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

// Sanitize input to prevent XSS
const sanitizeInput = (input: string): string => {
  return input.replace(/[<>]/g, "");
};

// GET: Fetch notifications
export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { isValid, userId, error } = await authenticatePropertyOwner(req);
    if (!isValid || !userId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type");

    logger.debug("GET /api/notifications request", { userId, type });

    const db = await connectToDatabase();
    const query: Partial<Notification> = { ownerId: userId };

    if (type && ["payment", "maintenance", "tenant", "other"].includes(type)) {
      query.type = type as Notification["type"];
    }

    const notifications = await db
      .collection<Notification>("notifications")
      .find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    logger.info("Notifications fetched successfully", {
      userId,
      type,
      notificationsCount: notifications.length,
      query,
    });

    return NextResponse.json(
      { success: true, data: notifications },
      { status: 200 }
    );
  } catch (error) {
    logger.error("Error fetching notifications", { error });
    return NextResponse.json(
      { success: false, message: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

// POST: Create notification or trigger reminders
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { isValid, userId, error } = await authenticatePropertyOwner(req);
    if (!isValid || !userId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const db = await connectToDatabase();
    const body = await req.json();
    const { pathname } = new URL(req.url);

    if (pathname.includes("reminders")) {
      // Handle trigger reminders
      const tenants = await db.collection<Tenant>("tenants").find({ ownerId: userId }).toArray();
      const notifications: Notification[] = [];

      for (const tenant of tenants) {
        const notification: Notification = {
          _id: uuidv4(),
          message: `Payment reminder for ${tenant.name}`,
          type: "payment",
          createdAt: new Date().toISOString(),
          status: "unread",
          tenantId: tenant._id.toString(),
          tenantName: tenant.name,
          ownerId: userId,
          deliveryMethod: tenant.deliveryMethod || "app",
          deliveryStatus: "pending",
        };

        if (["sms", "both"].includes(notification.deliveryMethod) && tenant.phone) {
          try {
            await sendWelcomeSms({
              phone: tenant.phone,
              message: notification.message.slice(0, 160),
            });
            notification.deliveryStatus = "success";
            logger.info("SMS sent successfully", { tenantId: tenant._id.toString(), phone: tenant.phone });
          } catch (error) {
            logger.error("Failed to send SMS", { tenantId: tenant._id.toString(), phone: tenant.phone, error });
            notification.deliveryStatus = "failed";
          }
        }

        if (["email", "both"].includes(notification.deliveryMethod) && tenant.email) {
          try {
            const html = generateStyledTemplate({
              name: tenant.name,
              title: "Payment Reminder",
              intro: "This is a reminder regarding your rental payment.",
              details: `<p>${notification.message}</p>`,
            });

            await transporter.sendMail({
              from: `"Smart Choice Rental Management" <${process.env.SMTP_USER}>`,
              to: tenant.email,
              subject: "Payment Reminder",
              html,
            });
            notification.deliveryStatus = notification.deliveryStatus === "failed" ? "failed" : "success";
            logger.info("Email sent successfully", { tenantId: tenant._id.toString(), email: tenant.email });
          } catch (error) {
            logger.error("Failed to send email", { tenantId: tenant._id.toString(), email: tenant.email, error });
            notification.deliveryStatus = "failed";
          }
        }

        await db.collection<Notification>("notifications").insertOne(notification);
        notifications.push(notification);
      }

      logger.info("Reminders triggered", { userId, notificationsCount: notifications.length });
      return NextResponse.json({ success: true, data: notifications }, { status: 201 });
    }

    // Handle create notification
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

    if (!deliveryMethod || !["app", "sms", "email", "both"].includes(deliveryMethod)) {
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
      tenants = await db.collection<Tenant>("tenants").find({ ownerId: userId }).limit(100).toArray();
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

    if (["sms", "both"].includes(deliveryMethod) && !tenants.some((t) => t.phone)) {
      logger.warn("No valid phone numbers for SMS delivery", { userId, tenantId });
      return NextResponse.json(
        { success: false, message: "No valid phone numbers available for SMS delivery" },
        { status: 400 }
      );
    }

    if (["email", "both"].includes(deliveryMethod) && !tenants.some((t) => t.email)) {
      logger.warn("No valid email addresses for email delivery", { userId, tenantId });
      return NextResponse.json(
        { success: false, message: "No valid email addresses available for email delivery" },
        { status: 400 }
      );
    }

    let finalMessage = message ? sanitizeInput(message) : "";
    let tenantName = tenantId === "all" ? "All Tenants" : tenants[0]?.name || "Unknown";
    let deliveryStatus: Notification["deliveryStatus"] = "pending";

    if (type === "payment" && tenantId !== "all" && tenants[0]) {
      finalMessage = tenants[0].price
        ? `Payment of Ksh. ${tenants[0].price.toFixed(2)} is due for ${tenants[0].name}`
        : `Payment reminder for ${tenants[0].name}`;
      tenantName = tenants[0].name;
    } else if (type === "payment" && tenantId === "all") {
      finalMessage = finalMessage || "Payment reminder for all tenants";
    } else if (type === "maintenance") {
      finalMessage = finalMessage || "Scheduled maintenance for your property";
    } else if (type === "tenant") {
      finalMessage = finalMessage || "Important tenant update";
    }

    let emailTitle: string;
    let emailIntro: string;
    let emailDetails: string;

    switch (type) {
      case "payment":
        emailTitle = "Payment Reminder";
        emailIntro = "This is a reminder regarding your rental payment.";
        emailDetails = `
          <ul>
            <li><strong>Message:</strong> ${finalMessage}</li>
            ${tenants[0]?.price ? `<li><strong>Amount:</strong> Ksh. ${tenants[0].price.toFixed(2)}</li>` : ""}
            <li><strong>Action:</strong> Please make your payment at your earliest convenience.</li>
          </ul>
        `;
        break;
      case "maintenance":
        emailTitle = "Maintenance Notification";
        emailIntro = "We have scheduled maintenance for your property.";
        emailDetails = `
          <ul>
            <li><strong>Message:</strong> ${finalMessage}</li>
            <li><strong>Action:</strong> Please ensure access to your property or contact us for details.</li>
          </ul>
        `;
        break;
      case "tenant":
        emailTitle = "Tenant Update";
        emailIntro = "Important update regarding your tenancy.";
        emailDetails = `
          <ul>
            <li><strong>Message:</strong> ${finalMessage}</li>
            <li><strong>Action:</strong> Please review the update and contact us if you have questions.</li>
          </ul>
        `;
        break;
      default:
        emailTitle = "Property Notification";
        emailIntro = "Important information from your property manager.";
        emailDetails = `
          <ul>
            <li><strong>Message:</strong> ${finalMessage}</li>
            <li><strong>Action:</strong> Please review and contact us if needed.</li>
          </ul>
        `;
    }

    let smsSuccess = true;
    let emailSuccess = true;

    if (deliveryMethod === "sms" || deliveryMethod === "both") {
      for (const tenant of tenants) {
        if (tenant.phone) {
          try {
            await sendWelcomeSms({
              phone: tenant.phone,
              message: finalMessage.slice(0, 160),
            });
            logger.info("SMS sent successfully", { tenantId: tenant._id.toString(), phone: tenant.phone });
          } catch (error) {
            logger.error("Failed to send SMS", { tenantId: tenant._id.toString(), phone: tenant.phone, error });
            smsSuccess = false;
          }
        }
      }
    }

    if (deliveryMethod === "email" || deliveryMethod === "both") {
      for (const tenant of tenants) {
        if (tenant.email) {
          try {
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
          } catch (error) {
            logger.error("Failed to send email", { tenantId: tenant._id.toString(), email: tenant.email, error });
            emailSuccess = false;
          }
        }
      }
    }

    deliveryStatus = smsSuccess && emailSuccess ? "success" : "failed";

    const notification: Notification = {
      _id: uuidv4(),
      message: finalMessage,
      type,
      createdAt: new Date().toISOString(),
      status: "unread",
      tenantId,
      tenantName,
      ownerId: userId,
      deliveryMethod,
      deliveryStatus,
    };

    await db.collection<Notification>("notifications").insertOne(notification);

    logger.info("Notification created successfully", {
      userId,
      tenantId,
      type,
      deliveryMethod,
      deliveryStatus,
    });

    return NextResponse.json({ success: true, data: notification }, { status: 201 });
  } catch (error) {
    logger.error("Error creating notification", { error });
    return NextResponse.json(
      { success: false, message: "Failed to create notification" },
      { status: 500 }
    );
  }
}

// DELETE: Delete a notification
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { isValid, userId, error } = await authenticatePropertyOwner(req);
    if (!isValid || !userId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const notificationId = searchParams.get("notificationId");

    if (!notificationId) {
      logger.warn("Missing notification ID", { userId });
      return NextResponse.json(
        { success: false, message: "Notification ID is required" },
        { status: 400 }
      );
    }

    logger.debug("DELETE /api/notifications request", { userId, notificationId });

    const db = await connectToDatabase();
    const result = await db.collection<Notification>("notifications").deleteOne({
      _id: notificationId,
      ownerId: userId,
    });

    if (result.deletedCount === 0) {
      logger.warn("Notification not found or unauthorized", { userId, notificationId });
      return NextResponse.json(
        { success: false, message: "Notification not found or unauthorized" },
        { status: 404 }
      );
    }

    logger.info("Notification deleted successfully", { userId, notificationId });
    return NextResponse.json({ success: true, message: "Notification deleted" }, { status: 200 });
  } catch (error) {
    logger.error("Error deleting notification", { error });
    return NextResponse.json(
      { success: false, message: "Failed to delete notification" },
      { status: 500 }
    );
  }
}