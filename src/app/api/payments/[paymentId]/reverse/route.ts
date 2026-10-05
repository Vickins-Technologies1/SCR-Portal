import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken, buildInvalidCsrfResponse } from "@/lib/csrf";
import { createPaymentReversal } from "@/lib/financial-ledger";

export async function POST(request: NextRequest, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const userId = request.cookies.get("userId")?.value || "";
  const role = request.cookies.get("role")?.value || "";
  if (!ObjectId.isValid(paymentId) || !userId || !["admin", "propertyOwner", "teamMember"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized or invalid payment" }, { status: 401 });
  }
  const csrf = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrf)) return buildInvalidCsrfResponse(request);

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 }); }
  const amount = Number(body?.amount);
  const reason = String(body?.reason || "").trim();
  const idempotencyKey = String(body?.idempotencyKey || "").trim();
  if (!Number.isFinite(amount) || amount <= 0 || !reason || !idempotencyKey) {
    return NextResponse.json({ success: false, message: "amount, reason and idempotencyKey are required" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const payment = await db.collection("payments").findOne({ _id: new ObjectId(paymentId) });
  if (!payment) return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
  if (role !== "admin") {
    const member = role === "teamMember"
      ? await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), active: true })
      : null;
    const ownerId = role === "teamMember" ? String(member?.ownerId || "") : userId;
    const property = ObjectId.isValid(String(payment.propertyId))
      ? await db.collection("properties").findOne({ _id: new ObjectId(String(payment.propertyId)) })
      : null;
    const permitted = role === "propertyOwner" || Boolean(member?.permissions?.includes("payments:record"));
    if (!property || String(property.ownerId) !== ownerId || !permitted) {
      return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
    }
  }

  try {
    const reversal = await createPaymentReversal({
      db,
      paymentId,
      amount,
      reason,
      actorId: userId,
      actorRole: role,
      idempotencyKey,
      providerReference: body?.providerReference || null,
    });
    return NextResponse.json({ success: true, reversal }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Reversal failed" }, { status: 409 });
  }
}
