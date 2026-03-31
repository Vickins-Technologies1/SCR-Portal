import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";

interface SupportMessage {
  _id: ObjectId;
  ownerId: string;
  senderId: string;
  senderRole: "propertyOwner" | "admin";
  senderName?: string;
  message: string;
  replyTo?: {
    messageId: string;
    message: string;
    senderRole: "propertyOwner" | "admin";
    senderName?: string;
    createdAt?: string;
  };
  attachments?: {
    url: string;
    name: string;
    type: string;
    size: number;
  }[];
  createdAt: string;
  updatedAt?: string;
  seenByAdmin?: boolean;
  seenByOwner?: boolean;
}

const MAX_MESSAGE_LENGTH = 2000;
const MAX_ATTACHMENTS = 5;
const MAX_REPLY_PREVIEW = 240;
const AUTO_REPLY_WINDOW_MINUTES = 30;
const AUTO_REPLY_MESSAGE =
  "Thanks for reaching out! Our support team has received your message and will get back to you shortly.";

const sanitizeReplyTo = (value?: Partial<SupportMessage["replyTo"]>) => {
  if (!value || typeof value !== "object") return undefined;
  const messageId = String(value.messageId || "").trim();
  if (!messageId || !ObjectId.isValid(messageId)) return undefined;
  const message = String(value.message || "").trim();
  if (!message) return undefined;
  const senderRole =
    value.senderRole === "admin" || value.senderRole === "propertyOwner"
      ? value.senderRole
      : undefined;
  if (!senderRole) return undefined;
  const senderName = value.senderName ? String(value.senderName) : undefined;
  const createdAt = value.createdAt ? String(value.createdAt) : undefined;
  return {
    messageId,
    message: message.slice(0, MAX_REPLY_PREVIEW),
    senderRole,
    senderName,
    createdAt,
  };
};

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  const userId = request.cookies.get("userId")?.value;

  if (!role || !userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!["admin", "propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const ownerIdParam = searchParams.get("ownerId");
  const unreadCountOnly = searchParams.get("unreadCount") === "1";
  const ownerId = role === "admin" ? ownerIdParam : userId;

  if (unreadCountOnly) {
    try {
      const { db } = await connectToDatabase();
      if (role === "admin") {
        if (ownerIdParam && !ObjectId.isValid(ownerIdParam)) {
          return NextResponse.json({ success: false, message: "Valid ownerId is required" }, { status: 400 });
        }
        const filter: Record<string, unknown> = {
          senderRole: "propertyOwner",
          seenByAdmin: { $ne: true },
        };
        if (ownerIdParam) {
          filter.ownerId = ownerIdParam;
        }
        const unreadCount = await db.collection<SupportMessage>("supportMessages").countDocuments(filter);
        return NextResponse.json({ success: true, unreadCount });
      }

      if (!userId || !ObjectId.isValid(userId)) {
        return NextResponse.json({ success: false, message: "Valid ownerId is required" }, { status: 400 });
      }
      const unreadCount = await db.collection<SupportMessage>("supportMessages").countDocuments({
        ownerId: userId,
        senderRole: "admin",
        seenByOwner: { $ne: true },
      });
      return NextResponse.json({ success: true, unreadCount });
    } catch (error) {
      logger.error("Support unread count error", {
        message: error instanceof Error ? error.message : "Unknown error",
        ownerId: ownerIdParam || userId,
        role,
      });
      return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
    }
  }

  if (!ownerId || !ObjectId.isValid(ownerId)) {
    return NextResponse.json({ success: false, message: "Valid ownerId is required" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();

    const messages = await db
      .collection<SupportMessage>("supportMessages")
      .find({ ownerId })
      .sort({ createdAt: 1 })
      .toArray();

    if (role === "admin") {
      await db.collection<SupportMessage>("supportMessages").updateMany(
        { ownerId, senderRole: "propertyOwner", seenByAdmin: { $ne: true } },
        { $set: { seenByAdmin: true } }
      );
    } else {
      await db.collection<SupportMessage>("supportMessages").updateMany(
        { ownerId, senderRole: "admin", seenByOwner: { $ne: true } },
        { $set: { seenByOwner: true } }
      );
    }

    return NextResponse.json({
      success: true,
      messages: messages.map((msg) => ({
        ...msg,
        _id: msg._id.toString(),
      })),
    });
  } catch (error) {
    logger.error("Support messages fetch error", {
      message: error instanceof Error ? error.message : "Unknown error",
      ownerId,
      role,
    });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  const userId = request.cookies.get("userId")?.value;

  if (!role || !userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!["admin", "propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  let payload: {
    ownerId?: string;
    message?: string;
    attachments?: SupportMessage["attachments"];
    replyTo?: SupportMessage["replyTo"];
  } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  const rawMessage = String(payload.message || "").trim();
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  if (!rawMessage && attachments.length === 0) {
    return NextResponse.json(
      { success: false, message: "Message or attachment is required" },
      { status: 400 }
    );
  }
  if (rawMessage && rawMessage.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { success: false, message: "Message must be between 1 and 2000 characters" },
      { status: 400 }
    );
  }
  if (attachments.length > MAX_ATTACHMENTS) {
    return NextResponse.json(
      { success: false, message: `Maximum ${MAX_ATTACHMENTS} attachments allowed` },
      { status: 400 }
    );
  }
  const sanitizedAttachments = attachments
    .filter((att) => att && typeof att.url === "string")
    .map((att) => ({
      url: String(att.url),
      name: String(att.name || "attachment"),
      type: String(att.type || "application/octet-stream"),
      size: Number(att.size || 0),
    }));
  const replyTo = sanitizeReplyTo(payload.replyTo);

  const ownerId = role === "admin" ? payload.ownerId : userId;
  if (!ownerId || !ObjectId.isValid(ownerId)) {
    return NextResponse.json({ success: false, message: "Valid ownerId is required" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();

    let senderName = role === "admin" ? "Admin" : "Owner";
    if (role === "propertyOwner") {
      const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(userId) });
      senderName = owner?.name || "Owner";
    }

    const messageDoc: SupportMessage = {
      _id: new ObjectId(),
      ownerId,
      senderId: userId,
      senderRole: role as "propertyOwner" | "admin",
      senderName,
      message: rawMessage,
      attachments: sanitizedAttachments.length > 0 ? sanitizedAttachments : undefined,
      replyTo,
      createdAt: new Date().toISOString(),
      seenByAdmin: role === "admin",
      seenByOwner: role === "propertyOwner",
    };

    await db.collection<SupportMessage>("supportMessages").insertOne(messageDoc);

    if (role === "propertyOwner") {
      const lastAdminMessage = await db
        .collection<SupportMessage>("supportMessages")
        .find({ ownerId, senderRole: "admin" })
        .sort({ createdAt: -1 })
        .limit(1)
        .toArray();

      const shouldAutoReply =
        lastAdminMessage.length === 0 ||
        Date.now() - new Date(lastAdminMessage[0].createdAt).getTime() > AUTO_REPLY_WINDOW_MINUTES * 60 * 1000;

      if (shouldAutoReply) {
        const autoReply: SupportMessage = {
          _id: new ObjectId(),
          ownerId,
          senderId: "support-bot",
          senderRole: "admin",
          senderName: "Support Team",
          message: AUTO_REPLY_MESSAGE,
          createdAt: new Date().toISOString(),
          seenByAdmin: true,
          seenByOwner: false,
        };
        await db.collection<SupportMessage>("supportMessages").insertOne(autoReply);
      }
    }

    return NextResponse.json({
      success: true,
      message: {
        ...messageDoc,
        _id: messageDoc._id.toString(),
      },
    });
  } catch (error) {
    logger.error("Support message send error", {
      message: error instanceof Error ? error.message : "Unknown error",
      ownerId,
      role,
    });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  const userId = request.cookies.get("userId")?.value;

  if (!role || !userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!["admin", "propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  let payload: { messageId?: string; message?: string } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  const messageId = payload.messageId;
  const updatedMessage = String(payload.message || "").trim();
  if (!messageId || !ObjectId.isValid(messageId)) {
    return NextResponse.json({ success: false, message: "Valid messageId is required" }, { status: 400 });
  }

  if (!updatedMessage || updatedMessage.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { success: false, message: "Message must be between 1 and 2000 characters" },
      { status: 400 }
    );
  }

  try {
    const { db } = await connectToDatabase();
    const existing = await db.collection<SupportMessage>("supportMessages").findOne({
      _id: new ObjectId(messageId),
      senderId: userId,
      senderRole: role as "propertyOwner" | "admin",
    });

    if (!existing) {
      return NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
    }

    const updatedAt = new Date().toISOString();
    await db.collection<SupportMessage>("supportMessages").updateOne(
      { _id: new ObjectId(messageId) },
      { $set: { message: updatedMessage, updatedAt } }
    );

    return NextResponse.json({
      success: true,
      message: {
        ...existing,
        _id: existing._id.toString(),
        message: updatedMessage,
        updatedAt,
      },
    });
  } catch (error) {
    logger.error("Support message edit error", {
      message: error instanceof Error ? error.message : "Unknown error",
      messageId,
      userId,
    });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  const userId = request.cookies.get("userId")?.value;

  if (!role || !userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!["admin", "propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  let payload: { messageId?: string } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  const messageId = payload.messageId;
  if (!messageId || !ObjectId.isValid(messageId)) {
    return NextResponse.json({ success: false, message: "Valid messageId is required" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const result = await db.collection<SupportMessage>("supportMessages").deleteOne({
      _id: new ObjectId(messageId),
      senderId: userId,
      senderRole: role as "propertyOwner" | "admin",
    });

    if (!result.deletedCount) {
      return NextResponse.json({ success: false, message: "Message not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Support message delete error", {
      message: error instanceof Error ? error.message : "Unknown error",
      messageId,
      userId,
    });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
