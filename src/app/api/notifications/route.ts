import { NextResponse, NextRequest } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";
import { sendWelcomeSms } from "../../../lib/sms";
import { generateStyledTemplate } from "../../../lib/email-template";
import nodemailer from "nodemailer";

// Database connection
const connectToDatabase = async (): Promise<Db> => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  await client.connect();
  return client.db("rentaldb");
};

// Nodemailer transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// TypeScript Interfaces
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

// Helper function to validate property owner
const authenticatePropertyOwner = async () => {
  const cookieStore = await cookies();
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;

  if (!userId || role !== "propertyOwner") {
    return { isValid: false, error: "Unauthorized: Property owner access required", userId: null };
  }
  return { isValid: true, userId };
};

// Helper function to validate tenant ownership
const validateTenantOwnership = async (db: Db, tenantId: string, ownerId: string) => {
  if (tenantId === "all") return true;
  try {
    const tenant = await db.collection<Tenant>("tenants").findOne({
      _id: new ObjectId(tenantId),
      ownerId,
    });
    return !!tenant;
  } catch (error) {
    console.error("Error validating tenant ownership:", error);
    return false;
  }
};

// Sanitize input to prevent injection
const sanitizeInput = (input: string): string => {
  return input.replace(/[<>]/g, "");
};

// GET /api/notifications
export async function GET(): Promise<NextResponse> {
  try {
    const { isValid, userId, error } = await authenticatePropertyOwner();
    if (!isValid || !userId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const db = await connectToDatabase();
    const notifications = await db
      .collection<Notification>("notifications")
      .find({ ownerId: userId })
      .sort({ createdAt: -1 })
      .toArray();

    // Convert ObjectId to string for frontend compatibility
    const formattedNotifications = notifications.map((n) => ({
      ...n,
      _id: n._id.toString(),
      tenantId: n.tenantId === "all" ? "all" : n.tenantId,
    }));

    return NextResponse.json({ success: true, data: formattedNotifications }, { status: 200 });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}

// POST /api/notifications or /api/notifications/mark-read
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { isValid, userId, error } = await authenticatePropertyOwner();
    if (!isValid || !userId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const db = await connectToDatabase();
    const body = await req.json();
    console.log("Received POST payload:", body);
    const { pathname } = new URL(req.url);

    if (pathname.includes("mark-read")) {
      // Handle marking notification as read
      const { notificationId } = body;
      if (!notificationId) {
        return NextResponse.json(
          { success: false, message: "Notification ID is required" },
          { status: 400 }
        );
      }

      console.log(`Attempting to mark notification ${notificationId} as read for owner ${userId}`);
      const result = await db.collection<Notification>("notifications").updateOne(
        { _id: notificationId, ownerId: userId },
        { $set: { status: "read" } }
      );

      if (result.matchedCount === 0) {
        console.log(`Notification ${notificationId} not found or unauthorized for owner ${userId}`);
        return NextResponse.json(
          { success: false, message: "Notification not found or unauthorized" },
          { status: 404 }
        );
      }

      console.log(`Notification ${notificationId} marked as read`);
      return NextResponse.json({ success: true }, { status: 200 });
    } else {
      // Handle creating a new notification
      const { message, tenantId, type, deliveryMethod } = body;

      if (!tenantId) {
        return NextResponse.json(
          { success: false, message: "Tenant ID is required" },
          { status: 400 }
        );
      }

      if (!type || !["payment", "maintenance", "tenant", "other"].includes(type)) {
        return NextResponse.json(
          { success: false, message: "Valid notification type is required (payment, maintenance, tenant, or other)" },
          { status: 400 }
        );
      }

      if (!deliveryMethod || !["app", "sms", "email", "both"].includes(deliveryMethod)) {
        return NextResponse.json(
          { success: false, message: "Valid delivery method is required (app, sms, email, or both)" },
          { status: 400 }
        );
      }

      if (!message && type !== "payment") {
        return NextResponse.json(
          { success: false, message: "Message is required for non-payment notifications" },
          { status: 400 }
        );
      }

      if (!(await validateTenantOwnership(db, tenantId, userId))) {
        return NextResponse.json(
          { success: false, message: "Invalid tenant ID or unauthorized access" },
          { status: 403 }
        );
      }

      // Generate message for payment notifications
      let finalMessage = message ? sanitizeInput(message) : "";
      let tenantName = "All Tenants";
      let deliveryStatus: Notification["deliveryStatus"] = "pending";

      // Fetch tenant(s) information
      let tenants: Tenant[] = [];
      if (tenantId === "all") {
        tenants = await db.collection<Tenant>("tenants").find({ ownerId: userId }).toArray();
      } else {
        const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(tenantId) });
        if (tenant) tenants = [tenant];
      }

      if (!tenants.length && tenantId !== "all") {
        return NextResponse.json(
          { success: false, message: "Tenant not found" },
          { status: 404 }
        );
      }

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

      // Define email template parameters based on notification type
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

      // Handle SMS and/or Email delivery
      if (deliveryMethod === "sms" || deliveryMethod === "both") {
        let smsSuccess = true;
        for (const tenant of tenants) {
          if (tenant.phone) {
            try {
              await sendWelcomeSms({
                phone: tenant.phone,
                message: finalMessage.slice(0, 160),
              });
            } catch (error) {
              console.error(`Failed to send SMS to ${tenant.phone}:`, error);
              smsSuccess = false;
            }
          }
        }
        deliveryStatus = smsSuccess ? "success" : "failed";
      }

      if (deliveryMethod === "email" || deliveryMethod === "both") {
        let emailSuccess = true;
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
              console.log(`Email sent to ${tenant.email}`);
            } catch (error) {
              console.error(`Failed to send email to ${tenant.email}:`, error);
              emailSuccess = false;
            }
          }
        }
        deliveryStatus = emailSuccess ? (deliveryStatus === "failed" ? "failed" : "success") : "failed";
      }

      const newNotification: Notification = {
        _id: uuidv4(),
        message: finalMessage,
        type,
        createdAt: new Date().toISOString(),
        status: "unread",
        tenantId,
        tenantName,
        ownerId: userId,
        deliveryMethod: deliveryMethod || "app",
        deliveryStatus,
      };

      await db.collection<Notification>("notifications").insertOne(newNotification);
      return NextResponse.json({ success: true, data: newNotification }, { status: 201 });
    }
  } catch (error) {
    console.error("Error processing POST request:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}

// DELETE /api/notifications
export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    const { isValid, userId, error } = await authenticatePropertyOwner();
    if (!isValid || !userId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const notificationId = searchParams.get("notificationId");

    if (!notificationId) {
      return NextResponse.json(
        { success: false, message: "Notification ID is required" },
        { status: 400 }
      );
    }

    const db = await connectToDatabase();
    const result = await db.collection<Notification>("notifications").deleteOne({
      _id: notificationId,
      ownerId: userId,
    });

    if (result.deletedCount === 0) {
      console.log(`Notification ${notificationId} not found or unauthorized for owner ${userId}`);
      return NextResponse.json(
        { success: false, message: "Notification not found or unauthorized" },
        { status: 404 }
      );
    }

    console.log(`Notification ${notificationId} deleted`);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete notification" },
      { status: 500 }
    );
  }
}