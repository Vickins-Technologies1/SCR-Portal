import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";

interface SupportConversation {
  ownerId: string;
  lastMessage: {
    message: string;
    senderRole: "propertyOwner" | "admin";
    createdAt: string;
  };
  unreadCount: number;
  assignedAdminId?: string | null;
  assignedAdminName?: string | null;
  labels?: string[];
}

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  const userId = request.cookies.get("userId")?.value;

  if (!role || !userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  try {
    const { db } = await connectToDatabase();

    const rows = await db
      .collection("supportMessages")
      .aggregate<{
        _id: string;
        lastMessage: { message: string; senderRole: "propertyOwner" | "admin"; createdAt: string };
        unreadCount: number;
      }>([
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$ownerId",
            lastMessage: { $first: { message: "$message", senderRole: "$senderRole", createdAt: "$createdAt" } },
            unreadCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ["$senderRole", "propertyOwner"] },
                      { $ne: ["$seenByAdmin", true] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { "lastMessage.createdAt": -1 } },
      ])
      .toArray();

    const ownerIds = rows
      .map((row) => row._id)
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const owners = ownerIds.length
      ? await db
          .collection("propertyOwners")
          .find({ _id: { $in: ownerIds } })
          .project({ name: 1, email: 1 })
          .toArray()
      : [];

    const ownerMap = new Map(
      owners.map((owner) => [owner._id.toString(), { name: owner.name || "Owner", email: owner.email || "" }])
    );

    const tickets = ownerIds.length
      ? await db
          .collection<{ ownerId: string; assignedAdminId?: string | null; labels?: string[] }>("supportTickets")
          .find({ ownerId: { $in: ownerIds.map((id) => id.toString()) } })
          .toArray()
      : [];

    const ticketMap = new Map(
      tickets.map((ticket) => [
        ticket.ownerId,
        {
          assignedAdminId: ticket.assignedAdminId || null,
          labels: Array.isArray(ticket.labels) ? ticket.labels : [],
        },
      ])
    );

    const assignedAdminIds = tickets
      .map((ticket) => ticket.assignedAdminId)
      .filter((id): id is string => Boolean(id) && ObjectId.isValid(id))
      .map((id) => new ObjectId(id));

    const assignedAdmins = assignedAdminIds.length
      ? await db
          .collection("propertyOwners")
          .find({ _id: { $in: assignedAdminIds } })
          .project({ name: 1 })
          .toArray()
      : [];

    const assignedAdminMap = new Map(
      assignedAdmins.map((admin) => [admin._id.toString(), admin.name || "Admin"])
    );

    const conversations: SupportConversation[] = rows.map((row) => {
      const ticket = ticketMap.get(row._id);
      const assignedAdminId = ticket?.assignedAdminId || null;
      return {
        ownerId: row._id,
        lastMessage: row.lastMessage,
        unreadCount: row.unreadCount,
        assignedAdminId,
        assignedAdminName: assignedAdminId ? assignedAdminMap.get(assignedAdminId) || "Admin" : null,
        labels: ticket?.labels || [],
      };
    });

    return NextResponse.json({
      success: true,
      conversations: conversations.map((conversation) => ({
        ...conversation,
        ownerName: ownerMap.get(conversation.ownerId)?.name || "Owner",
        ownerEmail: ownerMap.get(conversation.ownerId)?.email || "",
      })),
    });
  } catch (error) {
    logger.error("Support conversations fetch error", {
      message: error instanceof Error ? error.message : "Unknown error",
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

  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  let payload: { ownerId?: string; assignedAdminId?: string | null; labels?: string[] } = {};
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
  }

  const ownerId = payload.ownerId;
  if (!ownerId || !ObjectId.isValid(ownerId)) {
    return NextResponse.json({ success: false, message: "Valid ownerId is required" }, { status: 400 });
  }

  const assignedAdminId =
    payload.assignedAdminId && ObjectId.isValid(payload.assignedAdminId)
      ? payload.assignedAdminId
      : null;

  const labels = Array.isArray(payload.labels)
    ? payload.labels
        .map((label) => String(label).trim())
        .filter((label) => label.length > 0)
        .slice(0, 6)
    : [];

  try {
    const { db } = await connectToDatabase();
    await db.collection("supportTickets").updateOne(
      { ownerId },
      {
        $set: {
          ownerId,
          assignedAdminId,
          labels,
          updatedAt: new Date().toISOString(),
        },
        $setOnInsert: {
          createdAt: new Date().toISOString(),
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Support conversations update error", {
      message: error instanceof Error ? error.message : "Unknown error",
      ownerId,
    });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
