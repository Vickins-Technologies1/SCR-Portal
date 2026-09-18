import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { updatePayoutStatus, type PayoutStatus } from "@/lib/referrals";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request, "admin:referrals:manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const status = body.status as PayoutStatus;
  if (!["processing", "paid", "failed", "cancelled", "reversed"].includes(status)) return NextResponse.json({ success: false, message: "Invalid payout status" }, { status: 400 });
  try {
    const { db } = await connectToDatabase();
    const payout = await updatePayoutStatus({ db, payoutId: id, status, adminUserId: auth.userId, reference: typeof body.reference === "string" ? body.reference.trim() : undefined, failureReason: typeof body.failureReason === "string" ? body.failureReason.trim() : undefined });
    return NextResponse.json({ success: true, payout });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to update payout" }, { status: 400 });
  }
}
