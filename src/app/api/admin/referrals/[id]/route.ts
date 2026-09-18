import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { connectToDatabase } from "@/lib/mongodb";
import { reverseReferralReward } from "@/lib/referrals";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request, "admin:referrals:manage");
  if (auth instanceof NextResponse) return auth;
  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  if (body.action !== "reverse_reward") return NextResponse.json({ success: false, message: "Unsupported referral action" }, { status: 400 });
  try {
    const { db } = await connectToDatabase();
    const referral = await reverseReferralReward({ db, referralId: id, adminUserId: auth.userId, reason: typeof body.reason === "string" ? body.reason.trim() : undefined });
    return NextResponse.json({ success: true, referral });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to reverse referral reward" }, { status: 400 });
  }
}
