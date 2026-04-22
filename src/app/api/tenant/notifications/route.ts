import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "../../../../lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../lib/csrf";
import logger from "../../../../lib/logger";

type NotificationType = "payment" | "maintenance" | "tenant" | "other";
type NotificationStatus = "unread" | "read";

interface NotificationDoc {
  _id: ObjectId;
  message: string;
  type: NotificationType;
  createdAt: string;
  status: NotificationStatus;
  tenantId: string;
  tenantName?: string;
  ownerId?: string;
  audience?: "tenant" | "owner";
  deliveryMethod?: "app" | "sms" | "email" | "whatsapp" | "both";
  deliveryStatus?: "pending" | "success" | "failed";
  errorDetails?: string | null;
  dues?: unknown;
}

const resolveTargetTenantId = async (
  req: NextRequest,
  db: any
): Promise<{ targetTenantId: string; error?: string; status?: number }> => {
  const cookieStore = req.cookies;
  const userId = cookieStore.get("userId")?.value;
  const role = cookieStore.get("role")?.value;
  const impersonatingTenantId = cookieStore.get("impersonatingTenantId")?.value;
  const isImpersonating = cookieStore.get("isImpersonating")?.value === "true";

  if (!userId || !ObjectId.isValid(userId)) {
    return { targetTenantId: "", error: "Unauthorized", status: 401 };
  }

  if (role === "tenant") {
    return { targetTenantId: userId };
  }

  if (role === "propertyOwner" && isImpersonating && impersonatingTenantId && ObjectId.isValid(impersonatingTenantId)) {
    const tenantCheck = await db.collection("tenants").findOne({
      _id: new ObjectId(impersonatingTenantId),
      ownerId: userId,
    });
    if (!tenantCheck) {
      return { targetTenantId: "", error: "Unauthorized to view this tenant", status: 403 };
    }
    return { targetTenantId: impersonatingTenantId };
  }

  return { targetTenantId: "", error: "Invalid role", status: 403 };
};

const buildTenantNotificationFilter = (targetTenantId: string) => {
  return {
    tenantId: targetTenantId,
    $and: [
      { $or: [{ audience: { $exists: false } }, { audience: "tenant" }] },
      { $nor: [{ type: "tenant", message: /requested to delete tenant/i }] },
    ],
  } as Record<string, unknown>;
};

export async function GET(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    const auth = await resolveTargetTenantId(req, db);
    if (auth.error) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const unreadCountOnly = searchParams.get("unreadCount") === "1";
    const statusParam = searchParams.get("status");
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    const baseFilter: any = buildTenantNotificationFilter(auth.targetTenantId);
    if (statusParam === "unread" || statusParam === "read") {
      baseFilter.status = statusParam;
    }

    if (unreadCountOnly) {
      const unreadCount = await db.collection<NotificationDoc>("notifications").countDocuments({
        ...buildTenantNotificationFilter(auth.targetTenantId),
        status: "unread",
      });
      return NextResponse.json({ success: true, unreadCount });
    }

    const skip = (page - 1) * limit;

    const [notifications, total] = await Promise.all([
      db
        .collection<NotificationDoc>("notifications")
        .find(baseFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection<NotificationDoc>("notifications").countDocuments(baseFilter),
    ]);

    const formatted = notifications.map((n) => ({
      ...n,
      _id: n._id.toString(),
    }));

    return NextResponse.json({ success: true, data: formatted, total, page, limit });
  } catch (error) {
    logger.error("GET /api/tenant/notifications failed", { error });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const csrfHeader = req.headers.get("x-csrf-token") || req.headers.get("X-CSRF-Token");
  if (!validateCsrfToken(req, csrfHeader)) {
    return buildInvalidCsrfResponse(req);
  }

  try {
    const { db } = await connectToDatabase();
    const auth = await resolveTargetTenantId(req, db);
    if (auth.error) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status || 401 });
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const notificationId = (body as any)?.notificationId as string | undefined;
    const markAllRead = Boolean((body as any)?.markAllRead);

    const filterBase: any = buildTenantNotificationFilter(auth.targetTenantId);

    if (markAllRead) {
      const result = await db
        .collection<NotificationDoc>("notifications")
        .updateMany({ ...filterBase, status: "unread" }, { $set: { status: "read" } });
      return NextResponse.json({ success: true, matched: result.matchedCount, modified: result.modifiedCount });
    }

    if (!notificationId) {
      return NextResponse.json({ success: false, message: "notificationId is required" }, { status: 400 });
    }

    const idFilter: Record<string, unknown> = { ...filterBase };
    if (ObjectId.isValid(notificationId)) {
      idFilter.$or = [{ _id: new ObjectId(notificationId) }, { _id: notificationId }];
    } else {
      idFilter._id = notificationId;
    }

    const result = await db
      .collection<NotificationDoc>("notifications")
      .updateOne(idFilter, { $set: { status: "read" } });

    if (result.matchedCount === 0) {
      return NextResponse.json({ success: false, message: "Notification not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("PATCH /api/tenant/notifications failed", { error });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const csrfHeader = req.headers.get("x-csrf-token") || req.headers.get("X-CSRF-Token");
  if (!validateCsrfToken(req, csrfHeader)) {
    return buildInvalidCsrfResponse(req);
  }

  try {
    const { db } = await connectToDatabase();
    const auth = await resolveTargetTenantId(req, db);
    if (auth.error) {
      return NextResponse.json({ success: false, message: auth.error }, { status: auth.status || 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("notificationId");
    if (!id) {
      return NextResponse.json({ success: false, message: "notificationId required" }, { status: 400 });
    }

    if (!ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid notificationId" }, { status: 400 });
    }

    const filterBase: any = buildTenantNotificationFilter(auth.targetTenantId);

    const result = await db.collection<NotificationDoc>("notifications").deleteOne({
      ...filterBase,
      _id: new ObjectId(id),
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Deleted" }, { status: 200 });
  } catch (error) {
    logger.error("DELETE /api/tenant/notifications failed", { error });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
