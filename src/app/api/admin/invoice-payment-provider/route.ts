import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { getOwnerInvoicePaymentProvider } from "@/lib/owner-integrations";

const isAdmin = (request: NextRequest) => request.cookies.get("role")?.value === "admin";

export async function GET(request: NextRequest) {
  if (!isAdmin(request)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const { db } = await connectToDatabase();
  return NextResponse.json({ success: true, provider: await getOwnerInvoicePaymentProvider(db, "") });
}

export async function PUT(request: NextRequest) {
  if (!isAdmin(request)) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  const csrf = request.headers.get("x-csrf-token");
  if (!csrf || !(await validateCsrfToken(request, csrf))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  const provider = body?.provider;
  if (provider !== "kopokopo" && provider !== "daraja") return NextResponse.json({ success: false, message: "Invalid provider" }, { status: 400 });
  const { db } = await connectToDatabase();
  const existing = await db.collection<any>("platformSettings").findOne({ _id: "property_owner_invoice_payments" });
  const now = new Date().toISOString();
  await db.collection<any>("platformSettings").updateOne(
    { _id: "property_owner_invoice_payments" },
    { $set: { provider, invoicePaymentProvider: provider, updatedAt: now, updatedBy: request.cookies.get("userId")?.value || null }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  if (String(existing?.provider || "kopokopo") !== provider) {
    await db.collection("integrationAuditLog").insertOne({ type: "property_owner_invoice_payment_provider_changed", from: existing?.provider || "kopokopo", to: provider, changedAt: now, changedBy: request.cookies.get("userId")?.value || null });
  }
  return NextResponse.json({ success: true, provider });
}
