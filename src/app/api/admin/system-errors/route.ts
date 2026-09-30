import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { connectToDatabase } from "@/lib/mongodb";

function serialize(value: any): any {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, serialize(v)]));
  return value;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:dashboard:view");
  if (auth instanceof NextResponse) return auth;
  const params = request.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  if (params.get("severity")) filter.severity = params.get("severity");
  if (params.get("resolved") === "true" || params.get("resolved") === "false") filter.resolved = params.get("resolved") === "true";
  if (params.get("route")) filter.route = { $regex: params.get("route"), $options: "i" };
  if (params.get("q")) filter.$or = [{ message: { $regex: params.get("q"), $options: "i" } }, { errorName: { $regex: params.get("q"), $options: "i" } }, { errorId: { $regex: params.get("q"), $options: "i" } }];
  const { db } = await connectToDatabase();
  const logs = db.collection("systemErrorLogs");
  const [items, total, critical, today, unresolved, alertsSent] = await Promise.all([
    logs.find(filter).sort({ lastOccurred: -1 }).limit(100).toArray(), logs.countDocuments(), logs.countDocuments({ severity: "CRITICAL" }),
    logs.countDocuments({ lastOccurred: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) } }), logs.countDocuments({ resolved: false }),
    logs.aggregate([{ $group: { _id: null, total: { $sum: "$emailSentCount" } } }]).next(),
  ]);
  return NextResponse.json({ success: true, items: items.map(serialize), stats: { total, critical, today, unresolved, alertsSent: alertsSent?.total || 0 } });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:dashboard:view");
  if (auth instanceof NextResponse) return auth;
  const body = await request.json();
  if (typeof body.errorId !== "string" || typeof body.resolved !== "boolean") return NextResponse.json({ success: false, message: "Invalid request" }, { status: 400 });
  const { db } = await connectToDatabase();
  const result = await db.collection("systemErrorLogs").updateOne({ errorId: body.errorId }, { $set: { resolved: body.resolved, resolvedAt: body.resolved ? new Date() : null, resolvedBy: auth.userId, updatedAt: new Date() } });
  return NextResponse.json({ success: result.modifiedCount > 0 });
}
