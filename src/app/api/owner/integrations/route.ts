import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { getOwnerPaymentGateway } from "@/lib/owner-integrations";

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

    const { db } = await connectToDatabase();
    const paymentGateway = await getOwnerPaymentGateway(db, context.ownerId);
    return NextResponse.json({ success: true, integrations: { paymentGateway } });
  } catch (error) {
    console.error("GET /api/owner/integrations error:", error);
    return NextResponse.json({ success: false, message: "Failed to load integrations" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const context = await resolveOwnerContext(request);
    if (!context) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!context.canEdit) {
      return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });
    }

    const csrfToken = request.headers.get("x-csrf-token");
    if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
      return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
    }

    let payload: any;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
    }

    if (payload?.tuma) {
      return NextResponse.json({ success: false, message: "Tuma Gateway has been removed." }, { status: 410 });
    }
    const selectedGateway = payload?.paymentGateway;
    if (selectedGateway !== undefined && selectedGateway !== "daraja") {
      return NextResponse.json({ success: false, message: "Invalid payment gateway." }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const now = new Date().toISOString();
    await db.collection("ownerIntegrations").updateOne(
      { ownerId: new ObjectId(context.ownerId) },
      {
        $set: {
          ownerId: new ObjectId(context.ownerId),
          paymentGateway: "daraja",
          updatedAt: now,
        },
        $setOnInsert: { createdAt: now },
        $unset: { tuma: "" },
      },
      { upsert: true }
    );
    return NextResponse.json({ success: true, integrations: { paymentGateway: "daraja" } });
  } catch (error) {
    console.error("PUT /api/owner/integrations error:", error);
    return NextResponse.json({ success: false, message: "Failed to update integrations" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const context = await resolveOwnerContext(request);
    if (!context) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    if (!context.canEdit) {
      return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });
    }

    const csrfToken = request.headers.get("x-csrf-token");
    if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
      return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
    }

    const { db } = await connectToDatabase();
    await db.collection("ownerIntegrations").updateOne(
      { ownerId: new ObjectId(context.ownerId) },
      { $unset: { tuma: "" }, $set: { updatedAt: new Date().toISOString(), paymentGateway: "daraja" } }
    );
    return NextResponse.json({ success: true, message: "Removed integration data." });
  } catch (error) {
    console.error("DELETE /api/owner/integrations error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete integrations" }, { status: 500 });
  }
}
