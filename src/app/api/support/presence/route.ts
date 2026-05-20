import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { requireAdmin } from "@/lib/admin-auth";

interface SupportPresence {
  ownerId: string;
  role: "admin" | "propertyOwner";
  userId: string;
  lastSeen: string;
  typing?: boolean;
  typingUpdatedAt?: string;
}

const ONLINE_WINDOW_MS = 90 * 1000;
const TYPING_WINDOW_MS = 6 * 1000;

function deriveStatus(presence?: SupportPresence | null) {
  if (!presence) {
    return { online: false, typing: false, lastSeen: null };
  }
  const lastSeen = new Date(presence.lastSeen).getTime();
  const typingUpdated = presence.typingUpdatedAt ? new Date(presence.typingUpdatedAt).getTime() : 0;
  const now = Date.now();
  return {
    online: now - lastSeen <= ONLINE_WINDOW_MS,
    typing: Boolean(presence.typing) && now - typingUpdated <= TYPING_WINDOW_MS,
    lastSeen: presence.lastSeen,
  };
}

export async function GET(request: NextRequest) {
  const roleRaw = request.cookies.get("role")?.value;
  const userId = request.cookies.get("userId")?.value;

  if (!roleRaw || !userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (roleRaw !== "propertyOwner") {
    const auth = await requireAdmin(request, "admin:support:view");
    if (auth instanceof NextResponse) return auth;
  }

  const { searchParams } = new URL(request.url);
  const ownerIdParam = searchParams.get("ownerId");
  const ownerId = roleRaw === "propertyOwner" ? userId : ownerIdParam;

  if (!ownerId || !ObjectId.isValid(ownerId)) {
    return NextResponse.json({ success: false, message: "Valid ownerId is required" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const presenceDocs = await db
      .collection<SupportPresence>("supportPresence")
      .find({ ownerId })
      .toArray();

    const ownerPresence = presenceDocs.find((doc) => doc.role === "propertyOwner") || null;
    const adminPresence = presenceDocs.find((doc) => doc.role === "admin") || null;

    return NextResponse.json({
      success: true,
      owner: deriveStatus(ownerPresence),
      admin: deriveStatus(adminPresence),
    });
  } catch (error) {
    logger.error("Support presence fetch error", {
      message: error instanceof Error ? error.message : "Unknown error",
      ownerId,
      role: roleRaw,
    });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const roleRaw = request.cookies.get("role")?.value;
  const userId = request.cookies.get("userId")?.value;

  if (!roleRaw || !userId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (roleRaw !== "propertyOwner") {
    const auth = await requireAdmin(request, "admin:support:respond");
    if (auth instanceof NextResponse) return auth;
  }

  let payload: { ownerId?: string; typing?: boolean } = {};
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const ownerId = roleRaw === "propertyOwner" ? userId : payload.ownerId;
  if (!ownerId || !ObjectId.isValid(ownerId)) {
    return NextResponse.json({ success: false, message: "Valid ownerId is required" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const role: SupportPresence["role"] = roleRaw === "propertyOwner" ? "propertyOwner" : "admin";
    const now = new Date().toISOString();
    const update: Partial<SupportPresence> = { lastSeen: now };
    if (typeof payload.typing === "boolean") {
      update.typing = payload.typing;
      update.typingUpdatedAt = now;
    }

    await db.collection<SupportPresence>("supportPresence").updateOne(
      { ownerId, role },
      {
        $set: {
          ownerId,
          role,
          userId,
          ...update,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Support presence update error", {
      message: error instanceof Error ? error.message : "Unknown error",
      ownerId,
      role: roleRaw,
    });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
