import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { requireAdmin } from "../../../../lib/admin-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../../lib/csrf";
import { getSoftwareLeasingPercentage } from "../../../../lib/billing";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:settings:manage");
  if (auth instanceof NextResponse) return auth;
  const { db } = await connectToDatabase();
  return NextResponse.json({ success: true, softwareLeasingPercentage: await getSoftwareLeasingPercentage(db) });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:settings:manage");
  if (auth instanceof NextResponse) return auth;
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => ({}));
  const next = typeof body?.softwareLeasingPercentage === "number" ? body.softwareLeasingPercentage : Number(body?.softwareLeasingPercentage);
  if (!Number.isFinite(next) || next < 0 || next > 100) return NextResponse.json({ success: false, message: "Percentage must be a number between 0 and 100" }, { status: 400 });
  const { db } = await connectToDatabase();
  const previous = await getSoftwareLeasingPercentage(db);
  if (previous === next) return NextResponse.json({ success: true, softwareLeasingPercentage: next, changed: false });
  const now = new Date();
  await db.collection<any>("systemSettings").updateOne({ _id: "softwareLeasingPercentage" } as any, { $set: { key: "softwareLeasingPercentage", value: next, updatedAt: now, updatedBy: auth.userId } }, { upsert: true });
  await db.collection("auditLogs").insertOne({ action: "software_leasing_percentage_changed", previousPercentage: previous, newPercentage: next, reason: typeof body?.reason === "string" ? body.reason.trim().slice(0, 300) : null, adminUserId: auth.userId, timestamp: now.toISOString() });
  return NextResponse.json({ success: true, softwareLeasingPercentage: next, changed: true });
}
