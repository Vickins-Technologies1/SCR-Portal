import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { z } from "zod";
const Schema = z.object({ checkoutRequestId: z.string().trim().min(1) });
export async function POST(request: NextRequest) {
  const csrf = request.headers.get("x-csrf-token");
  if (!csrf || !(await validateCsrfToken(request, csrf))) return buildInvalidCsrfResponse(request);
  const ownerId = request.cookies.get("userId")?.value;
  if (!ownerId || request.cookies.get("role")?.value !== "propertyOwner") return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, message: "Invalid status request" }, { status: 400 });
  const { db } = await connectToDatabase();
  const payment = await db.collection("payments").findOne({ ownerId, paymentRail: "property_owner_invoice_daraja", checkoutRequestId: parsed.data.checkoutRequestId });
  if (!payment) return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
  return NextResponse.json({ success: true, status: payment.status, resultCode: payment.resultCode, resultDescription: payment.resultDescription, receipt: payment.mpesaReceiptNumber || payment.mpesaCode || null });
}
