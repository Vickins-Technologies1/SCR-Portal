import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { validateCsrfToken, buildInvalidCsrfResponse } from "@/lib/csrf";

const defaults = (landlordId: string) => ({ landlordId, invoicingEnabled: false, automaticGeneration: false, automaticIssuing: false, automaticSending: false, manualApproval: true, generationDay: 1, defaultDueDay: 5, eligiblePropertyIds: [] as string[], eligibleTenantIds: [] as string[], excludedTenantIds: [] as string[], invoicePrefix: "R", invoiceBrandName: "My Accurate Rent", invoiceBrandColor: "#0a2b4f", remindersEnabled: false, reminderBeforeDays: 5, reminderOnDueDate: true, overdueReminderEveryDays: 7, updatedAt: new Date() });

async function ownerContext(request: NextRequest, db: any) {
  const userId = request.cookies.get("userId")?.value || "";
  const role = request.cookies.get("role")?.value || "";
  if (!ObjectId.isValid(userId)) return null;
  if (role === "propertyOwner") return { ownerId: userId, actorId: userId, assignedPropertyIds: null as string[] | null };
  if (role === "teamMember") {
    const ownerId = request.cookies.get("ownerId")?.value || "";
    const member = ObjectId.isValid(ownerId) ? await db.collection("teamMembers").findOne({ _id: new ObjectId(userId), ownerId: new ObjectId(ownerId), active: true }) : null;
    if (!member || !Array.isArray(member.permissions) || !member.permissions.includes("settings:edit")) return null;
    return { ownerId, actorId: userId, assignedPropertyIds: Array.isArray(member.assignedPropertyIds) ? member.assignedPropertyIds.map(String) : [] };
  }
  return null;
}

export async function GET(request: NextRequest) {
  const { db } = await connectToDatabase();
  const context = await ownerContext(request, db);
  if (!context) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  const settings = await db.collection("landlordBillingSettings").findOne({ landlordId: context.ownerId });
  const properties = await db.collection("properties").find({ ownerId: { $in: [context.ownerId, new ObjectId(context.ownerId)] } }).project({ name: 1 }).toArray();
  const visibleProperties = properties.filter((p: any) => context.assignedPropertyIds === null || context.assignedPropertyIds.includes(p._id.toString()));
  const visibleSettings = settings || defaults(context.ownerId);
  if (context.assignedPropertyIds !== null) visibleSettings.eligiblePropertyIds = (visibleSettings.eligiblePropertyIds || []).filter((id: string) => context.assignedPropertyIds!.includes(id));
  const propertyIds = visibleProperties.map((p: any) => p._id.toString());
  const tenants = propertyIds.length ? await db.collection("tenants").find({ propertyId: { $in: propertyIds } }).project({ name: 1, propertyId: 1, houseNumber: 1, unitType: 1 }).toArray() : [];
  const visibleTenantIds = new Set(tenants.map((tenant: any) => String(tenant._id)));
  if (context.assignedPropertyIds !== null) {
    visibleSettings.eligibleTenantIds = (visibleSettings.eligibleTenantIds || []).filter((id: string) => visibleTenantIds.has(String(id)));
    visibleSettings.excludedTenantIds = (visibleSettings.excludedTenantIds || []).filter((id: string) => visibleTenantIds.has(String(id)));
  }
  return NextResponse.json({ success: true, settings: visibleSettings, properties: visibleProperties.map((p: any) => ({ _id: p._id.toString(), name: p.name })), tenants: tenants.map((t: any) => ({ _id: t._id.toString(), name: t.name, propertyId: String(t.propertyId), unit: t.houseNumber || t.unitType || "" })) });
}

export async function PUT(request: NextRequest) {
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ success: false, message: "Invalid settings" }, { status: 400 });
  const { db } = await connectToDatabase();
  const context = await ownerContext(request, db);
  if (!context) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
  const boundedInt = (key: string, min: number, max: number) => Number.isInteger(body[key]) && body[key] >= min && body[key] <= max;
  if (!boundedInt("generationDay", 1, 28) || !boundedInt("defaultDueDay", 1, 28) || !boundedInt("reminderBeforeDays", 0, 30) || !boundedInt("overdueReminderEveryDays", 1, 60)) return NextResponse.json({ success: false, message: "Invalid schedule values" }, { status: 400 });
  for (const key of ["invoicingEnabled", "automaticGeneration", "automaticIssuing", "automaticSending", "manualApproval", "remindersEnabled", "reminderOnDueDate"]) if (typeof body[key] !== "boolean") return NextResponse.json({ success: false, message: `Invalid ${key}` }, { status: 400 });
  if (!Array.isArray(body.eligiblePropertyIds) || !Array.isArray(body.eligibleTenantIds) || !Array.isArray(body.excludedTenantIds) || body.eligiblePropertyIds.length > 500 || body.eligibleTenantIds.length > 500 || body.excludedTenantIds.length > 500 || [...body.eligiblePropertyIds, ...body.eligibleTenantIds, ...body.excludedTenantIds].some((id: unknown) => typeof id !== "string" || !ObjectId.isValid(id))) return NextResponse.json({ success: false, message: "Invalid property or tenant selection" }, { status: 400 });
  const invoicePrefix = typeof body.invoicePrefix === "string" ? body.invoicePrefix.trim().toUpperCase() : "";
  const invoiceBrandName = typeof body.invoiceBrandName === "string" ? body.invoiceBrandName.trim().slice(0, 80) : "";
  const invoiceBrandColor = typeof body.invoiceBrandColor === "string" ? body.invoiceBrandColor : "";
  if (!/^[A-Z0-9]{1,10}(?:-[A-Z0-9]{1,10})?$/.test(invoicePrefix) || !invoiceBrandName || !/^#[0-9A-Fa-f]{6}$/.test(invoiceBrandColor)) return NextResponse.json({ success: false, message: "Invalid invoice prefix or branding" }, { status: 400 });
  const ownedProperties = await db.collection("properties").find({ ownerId: { $in: [context.ownerId, new ObjectId(context.ownerId)] } }).project({ _id: 1 }).toArray();
  const ownedIds = new Set(ownedProperties.map((row: any) => row._id.toString()));
  if (body.eligiblePropertyIds.some((id: string) => !ownedIds.has(id) || (context.assignedPropertyIds !== null && !context.assignedPropertyIds.includes(id)))) return NextResponse.json({ success: false, message: "One or more selected properties are not assigned to this account" }, { status: 403 });
  const selectedTenantIds = [...new Set([...body.eligibleTenantIds, ...body.excludedTenantIds])];
  const tenantRows = selectedTenantIds.length ? await db.collection("tenants").find({ _id: { $in: selectedTenantIds.map((id: string) => new ObjectId(id)) } }).project({ propertyId: 1 }).toArray() : [];
  const validTenantIds = new Set(tenantRows.filter((row: any) => ownedIds.has(String(row.propertyId)) && (context.assignedPropertyIds === null || context.assignedPropertyIds.includes(String(row.propertyId)))).map((row: any) => row._id.toString()));
  if (selectedTenantIds.some((id: string) => !validTenantIds.has(id))) return NextResponse.json({ success: false, message: "One or more selected tenants are outside your assigned properties" }, { status: 403 });
  const update = {
    ...defaults(context.ownerId),
    invoicingEnabled: body.invoicingEnabled,
    // Tenant invoice opt-in activates the due-date invoice workflow. Keep the
    // legacy automation fields aligned for older settings consumers.
    automaticGeneration: body.invoicingEnabled ? true : body.automaticGeneration,
    automaticIssuing: body.invoicingEnabled ? true : body.automaticIssuing,
    automaticSending: body.invoicingEnabled ? true : body.automaticSending,
    manualApproval: body.invoicingEnabled ? false : body.manualApproval,
    generationDay: body.generationDay, defaultDueDay: body.defaultDueDay,
    eligiblePropertyIds: [...new Set(body.eligiblePropertyIds)], eligibleTenantIds: [...new Set(body.eligibleTenantIds)], excludedTenantIds: [...new Set(body.excludedTenantIds)],
    invoicePrefix, invoiceBrandName, invoiceBrandColor, remindersEnabled: body.remindersEnabled,
    reminderBeforeDays: body.reminderBeforeDays, reminderOnDueDate: body.reminderOnDueDate, overdueReminderEveryDays: body.overdueReminderEveryDays,
    updatedBy: context.actorId, updatedAt: new Date(),
  };
  await db.collection("landlordBillingSettings").updateOne({ landlordId: context.ownerId }, { $set: update, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  return NextResponse.json({ success: true, settings: update });
}
