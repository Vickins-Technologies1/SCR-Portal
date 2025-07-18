import { NextResponse, NextRequest } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";
import { cookies } from "next/headers";
import { v4 as uuidv4 } from "uuid";

// Database connection
const connectToDatabase = async (): Promise<Db> => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  await client.connect();
  return client.db("rentaldb");
};

// TypeScript Interfaces
interface Tenant {
  _id: ObjectId;
  name: string;
  propertyId: string;
  ownerId: string;
  price?: number;
  status: string;
  paymentStatus: string;
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
  deliveryMethod?: "app" | "sms";
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
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
export async function GET(): Promise<NextResponse<ApiResponse<Notification[]>>> {
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
export async function POST(req: NextRequest): Promise<NextResponse<ApiResponse<Notification | void>>> {
  try {
    const { isValid, userId, error } = await authenticatePropertyOwner();
    if (!isValid || !userId) {
      return NextResponse.json({ success: false, message: error }, { status: 401 });
    }

    const db = await connectToDatabase();
    const body = await req.json();
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

      const result = await db.collection<Notification>("notifications").updateOne(
        { _id: notificationId, ownerId: userId },
        { $set: { status: "read" } }
      );

      if (result.matchedCount === 0) {
        return NextResponse.json(
          { success: false, message: "Notification not found or unauthorized" },
          { status: 404 }
        );
      }

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

      if (!message && type !== "payment") {
        return NextResponse.json(
          { success: false, message: "Message is required for non-payment notifications" },
          { status: 400 }
        );
      }

      if (!["payment", "maintenance", "tenant", "other"].includes(type)) {
        return NextResponse.json(
          { success: false, message: "Invalid notification type" },
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
      if (type === "payment" && tenantId !== "all") {
        const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(tenantId) });
        if (tenant) {
          finalMessage = tenant.price
            ? `Payment of Ksh. ${tenant.price.toFixed(2)} is due for ${tenant.name}`
            : `Payment reminder for ${tenant.name}`;
          tenantName = tenant.name;
        } else {
          return NextResponse.json(
            { success: false, message: "Tenant not found" },
            { status: 404 }
          );
        }
      } else if (type === "payment" && tenantId === "all") {
        finalMessage = finalMessage || "Payment reminder for all tenants";
      } else if (type === "maintenance") {
        finalMessage = finalMessage || "Scheduled maintenance for your property";
      } else if (type === "tenant") {
        finalMessage = finalMessage || "Important tenant update";
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
export async function DELETE(req: NextRequest): Promise<NextResponse<ApiResponse<void>>> {
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
      return NextResponse.json(
        { success: false, message: "Notification not found or unauthorized" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Error deleting notification:", error);
    return NextResponse.json(
      { success: false, message: "Failed to delete notification" },
      { status: 500 }
    );
  }
}