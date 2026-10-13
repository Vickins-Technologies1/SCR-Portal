import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { getOwnerInvoicePaymentProvider } from "@/lib/owner-integrations";
import { assertKopokopoInvoicePaymentConfigured } from "@/lib/kopokopo";
import { resolveDarajaPlatformStkCredentials } from "@/lib/mpesa";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:settings:manage");
  if (auth instanceof NextResponse) return auth;
  const { db } = await connectToDatabase();
  return NextResponse.json({ success: true, provider: await getOwnerInvoicePaymentProvider(db, "") });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:settings:manage");
  if (auth instanceof NextResponse) return auth;
  const csrf = request.headers.get("x-csrf-token");
  if (!csrf || !(await validateCsrfToken(request, csrf))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  const provider = body?.provider;
  if (provider !== "kopokopo" && provider !== "daraja") return NextResponse.json({ success: false, message: "Invalid provider" }, { status: 400 });
  try {
    if (provider === "kopokopo") assertKopokopoInvoicePaymentConfigured();
    else resolveDarajaPlatformStkCredentials();
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Selected provider is not configured" }, { status: 400 });
  }
  const { db } = await connectToDatabase();
  const existing = await db.collection<any>("platformSettings").findOne({ _id: "property_owner_invoice_payments" });
  const now = new Date().toISOString();
  await db.collection<any>("platformSettings").updateOne(
    { _id: "property_owner_invoice_payments" },
    { $set: { provider, invoicePaymentProvider: provider, updatedAt: now, updatedBy: auth.userId }, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );
  if (String(existing?.provider || "kopokopo") !== provider) {
    await db.collection("integrationAuditLog").insertOne({ type: "property_owner_invoice_payment_provider_changed", from: existing?.provider || "kopokopo", to: provider, changedAt: now, changedBy: auth.userId });
  }
  const persisted = await getOwnerInvoicePaymentProvider(db, "");
  return NextResponse.json({ success: true, provider: persisted });
}
