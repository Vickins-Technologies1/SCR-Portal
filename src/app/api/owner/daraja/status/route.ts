import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

const StatusSchema = z.object({
  checkoutRequestId: z.string().trim().min(1),
});

type OwnerContext = {
  ownerId: string;
  canView: boolean;
};

async function resolveOwnerContext(request: NextRequest): Promise<OwnerContext | null> {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || !["propertyOwner", "teamMember"].includes(role)) {
    return null;
  }

  if (role === "propertyOwner") {
    return { ownerId: userId, canView: true };
  }

  const { db } = await connectToDatabase();
  const member = await db.collection("teamMembers").findOne({
    _id: new ObjectId(userId),
    active: true,
  });

  if (!member?.ownerId) return null;

  const permissions: string[] = Array.isArray(member.permissions) ? member.permissions : [];
  const canView = permissions.includes("integrations:view") || permissions.includes("settings:view");

  return {
    ownerId: member.ownerId.toString(),
    canView,
  };
}

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
    return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
  }

  const context = await resolveOwnerContext(request);
  if (!context) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!context.canView) {
    return NextResponse.json({ success: false, message: "Insufficient permissions" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = StatusSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const payment = await db.collection("payments").findOne({
    ownerId: context.ownerId,
    $or: [
      { checkoutRequestId: parsed.data.checkoutRequestId },
      { transactionId: parsed.data.checkoutRequestId },
      { merchantRequestId: parsed.data.checkoutRequestId },
    ],
  });

  if (!payment) {
    return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    message: "Transaction status retrieved",
    status: payment.status,
    transaction: {
      amount: payment.amount,
      status: payment.status,
      paymentDate: payment.paymentDate,
      phoneNumber: payment.phoneNumber,
      reference: payment.reference,
      provider: payment.provider,
      mpesaMode: payment.mpesaMode || payment.integrationMode || null,
      mpesaCode: payment.mpesaCode,
      checkoutRequestId: payment.checkoutRequestId || payment.transactionId,
    },
  });
}

