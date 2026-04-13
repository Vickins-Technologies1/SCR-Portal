import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { fetchTumaBanks } from "@/lib/tuma";

type OwnerContext = {
  ownerId: string;
  canView: boolean;
  canEdit: boolean;
};

async function resolveOwnerContext(request: NextRequest): Promise<OwnerContext | null> {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || !["propertyOwner", "teamMember"].includes(role)) {
    return null;
  }

  if (role === "propertyOwner") {
    return { ownerId: userId, canView: true, canEdit: true };
  }

  const { db } = await connectToDatabase();
  const member = await db.collection("teamMembers").findOne({
    _id: new ObjectId(userId),
    active: true,
  });

  if (!member?.ownerId) return null;

  const permissions: string[] = Array.isArray(member.permissions) ? member.permissions : [];
  const canView = permissions.includes("integrations:view") || permissions.includes("settings:view");
  const canEdit = permissions.includes("integrations:edit") || permissions.includes("settings:edit");

  return {
    ownerId: member.ownerId.toString(),
    canView,
    canEdit,
  };
}

export async function GET(request: NextRequest) {
  try {
    const context = await resolveOwnerContext(request);
    if (!context) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!context.canView) {
      return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });
    }

    const banks = await fetchTumaBanks();
    const sorted = banks
      .filter((bank) => bank.id && bank.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, banks: sorted });
  } catch (error) {
    console.error("GET /api/owner/tuma/banks error:", error);
    return NextResponse.json({ success: false, message: "Failed to load banks" }, { status: 500 });
  }
}
