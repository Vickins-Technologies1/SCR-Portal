import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import {
  deleteOwnerDarajaIntegration,
  getOwnerDarajaIntegrations,
  saveOwnerDarajaSharedIntegration,
  saveOwnerDarajaUserPaybillIntegration,
} from "@/lib/owner-daraja";

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

const SharedPayloadSchema = z.object({
  mode: z.literal("shared_daraja"),
  enabled: z.boolean().optional().default(true),
  paymentType: z.enum(["till", "paybill"]),
  destinationNumber: z.string().trim().min(1),
  accountReference: z.string().trim().min(1).max(100),
});

const UserPaybillPayloadSchema = z.object({
  mode: z.literal("user_paybill"),
  enabled: z.boolean().optional().default(true),
  environment: z.enum(["sandbox", "production"]).default("sandbox"),
  shortcode: z.string().trim().min(1),
  consumerKey: z.string().trim().min(1),
  consumerSecret: z.string().trim().min(1),
  passkey: z.string().trim().min(1),
});

const DeleteSchema = z
  .object({
    mode: z.enum(["shared_daraja", "user_paybill"]).optional(),
  })
  .optional();

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
    const daraja = await getOwnerDarajaIntegrations(db, context.ownerId);

    return NextResponse.json({ success: true, integrations: { daraja } });
  } catch (error) {
    console.error("GET /api/owner/daraja error:", error);
    return NextResponse.json({ success: false, message: "Failed to load Daraja integrations" }, { status: 500 });
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

    let payload: unknown;
    try {
      payload = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
    }

    const mode = typeof payload === "object" && payload ? (payload as { mode?: string }).mode : "";
    const { db } = await connectToDatabase();

    if (mode === "shared_daraja") {
      const parsed = SharedPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, message: "Invalid shared Daraja payload", errors: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const updated = await saveOwnerDarajaSharedIntegration(db, context.ownerId, {
        enabled: parsed.data.enabled,
        paymentType: parsed.data.paymentType,
        destinationNumber: parsed.data.destinationNumber,
        accountReference: parsed.data.accountReference,
      });

      return NextResponse.json({
        success: true,
        message: "Shared Daraja integration saved successfully.",
        integrations: { daraja: updated },
      });
    }

    if (mode === "user_paybill") {
      const parsed = UserPaybillPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return NextResponse.json(
          { success: false, message: "Invalid Paybill payload", errors: parsed.error.flatten() },
          { status: 400 }
        );
      }

      const updated = await saveOwnerDarajaUserPaybillIntegration(db, context.ownerId, {
        enabled: parsed.data.enabled,
        environment: parsed.data.environment,
        shortcode: parsed.data.shortcode,
        consumerKey: parsed.data.consumerKey,
        consumerSecret: parsed.data.consumerSecret,
        passkey: parsed.data.passkey,
      });

      return NextResponse.json({
        success: true,
        message: "User-owned Paybill credentials saved successfully.",
        integrations: { daraja: updated },
      });
    }

    return NextResponse.json({ success: false, message: "Unsupported Daraja mode" }, { status: 400 });
  } catch (error) {
    console.error("PUT /api/owner/daraja error:", error);
    return NextResponse.json({ success: false, message: "Failed to update Daraja integrations" }, { status: 500 });
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

    let payload: unknown = undefined;
    try {
      payload = await request.json();
    } catch {
      payload = undefined;
    }

    const parsed = DeleteSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json({ success: false, message: "Invalid delete payload" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const updated = await deleteOwnerDarajaIntegration(db, context.ownerId, parsed.data?.mode);

    return NextResponse.json({
      success: true,
      message: "Daraja integration removed.",
      integrations: { daraja: updated },
    });
  } catch (error) {
    console.error("DELETE /api/owner/daraja error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete Daraja integrations" }, { status: 500 });
  }
}

