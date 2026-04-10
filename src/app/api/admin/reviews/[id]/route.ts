import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { REVIEW_COLLECTION } from "@/lib/property-reviews";

const normalizeStatus = (value?: string | null) => {
  const normalized = value?.toLowerCase();
  if (normalized === "approved" || normalized === "rejected") return normalized;
  return null;
};

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const role = request.cookies.get("role")?.value;
  if (!role || role !== "admin") {
    return NextResponse.json(
      { success: false, message: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  const { id } = await params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid review ID" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const body = payload as { status?: string; note?: string };
  const nextStatus = normalizeStatus(body.status);
  if (!nextStatus) {
    return NextResponse.json(
      { success: false, message: "Status must be 'approved' or 'rejected'." },
      { status: 400 }
    );
  }

  const moderationNote =
    typeof body.note === "string" ? body.note.trim().slice(0, 200) : undefined;
  const adminId = request.cookies.get("userId")?.value || "";
  const adminName = request.cookies.get("adminName")?.value || "Admin";
  const now = new Date();

  try {
    const { db } = await connectToDatabase();

    const result = await db.collection(REVIEW_COLLECTION).findOneAndUpdate(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: nextStatus,
          moderatedAt: now,
          moderatedBy: adminId || null,
          moderatedByName: adminName,
          moderationNote: moderationNote || null,
        },
      },
      { returnDocument: "after" }
    );

    if (!result) {
      return NextResponse.json(
        { success: false, message: "Review not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        review: {
          _id: result._id?.toString?.() || "",
          status: result.status || nextStatus,
          moderatedAt: result.moderatedAt ? new Date(result.moderatedAt).toISOString() : null,
          moderatedByName: result.moderatedByName || adminName,
          moderationNote: result.moderationNote || undefined,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error moderating review:", error);
    return NextResponse.json(
      { success: false, message: "Unable to update review status." },
      { status: 500 }
    );
  }
}
