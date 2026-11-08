import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { identityValues } from "@/lib/payment-query";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import {
  analyzeTenantPaymentReconciliation,
  ensurePaymentReconciliationIndexes,
  executeTenantPaymentReconciliation,
} from "@/lib/payment-reconciliation";

type AccessScope = {
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"];
  client: Awaited<ReturnType<typeof connectToDatabase>>["client"];
  userId: string;
  role: string;
  canExecute: boolean;
};

const jsonError = (message: string, status: number) => NextResponse.json({ success: false, message }, { status });
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

async function resolveAccess(request: NextRequest, mode: "view" | "execute"): Promise<AccessScope | NextResponse> {
  const auth = await requireAdmin(request, mode === "execute" ? "admin:payments:manage" : "admin:payments:view");
  if (auth instanceof NextResponse) return auth;
  const { db, client } = await connectToDatabase();
  return {
    db, client, userId: auth.userId, role: auth.role,
    canExecute: auth.role === "admin" || auth.permissions.includes("admin:payments:manage"),
  };
}

async function resolvePropertyScope(db: AccessScope["db"], requestedLandlordId?: string | null) {
  const ownerFilter = requestedLandlordId ? { ownerId: { $in: identityValues(requestedLandlordId) } } : {};
  return db.collection("properties").find(ownerFilter).project({ _id: 1, name: 1, propertyName: 1, ownerId: 1, updatedAt: 1 }).sort({ name: 1, _id: 1 }).limit(2000).toArray();
}

async function mapWithConcurrency<T, U>(items: T[], concurrency: number, handler: (item: T) => Promise<U>) {
  const results = new Array<U>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await handler(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function getVisibleHistory(db: AccessScope["db"], propertyIds: string[], landlordId?: string | null, limit = 100) {
  if (!propertyIds.length) return [];
  const filter: Record<string, unknown> = { propertyId: { $in: propertyIds } };
  if (landlordId) filter.landlordId = landlordId;
  return db.collection("paymentReconciliations")
    .find(filter)
    .sort({ createdAt: -1, reconciliationId: -1 })
    .limit(limit)
    .toArray();
}

export async function GET(request: NextRequest) {
  const access = await resolveAccess(request, "view");
  if (access instanceof NextResponse) return access;
  const params = new URL(request.url).searchParams;
  const requestedLandlordId = params.get("landlordId");
  if (requestedLandlordId && !ObjectId.isValid(requestedLandlordId)) return jsonError("Invalid landlordId", 400);
  const propertyId = params.get("propertyId");
  const tenantId = params.get("tenantId");
  if (propertyId && !ObjectId.isValid(propertyId)) return jsonError("Invalid propertyId", 400);
  if (tenantId && !ObjectId.isValid(tenantId)) return jsonError("Invalid tenantId", 400);
  const startDate = params.get("startDate") || undefined;
  const endDate = params.get("endDate") || undefined;
  if (startDate && !validDate(startDate) || endDate && !validDate(endDate) || startDate && endDate && endDate < startDate) return jsonError("Invalid payment date range", 400);
  const paymentMethod = (params.get("paymentMethod") || "").trim().slice(0, 50);
  const search = (params.get("search") || "").trim().slice(0, 100);
  const unit = (params.get("unit") || "").trim().slice(0, 100);
  const requestedStatus = params.get("status") || "all";
  const allowedStatuses = ["all", "requires_review", "ready", "reconciled", "no_action", "failed"];
  if (!allowedStatuses.includes(requestedStatus)) return jsonError("Invalid reconciliation status", 400);
  const requestedLimit = Number(params.get("limit") || 100);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(250, requestedLimit)) : 100;

  const properties = await resolvePropertyScope(access.db, requestedLandlordId);
  const propertyById = new Map(properties.map((property: any) => [String(property._id), property]));
  let visiblePropertyIds = properties.map((property: any) => String(property._id));
  if (propertyId) {
    if (!propertyById.has(propertyId)) return jsonError("Property not found", 404);
    visiblePropertyIds = [propertyId];
  }

  if (params.get("view") === "history") {
    const history = await getVisibleHistory(access.db, visiblePropertyIds, requestedLandlordId, 250);
    const filteredHistory = history.filter((item: any) => !tenantId || String(item.tenantId) === tenantId);
    return NextResponse.json({ success: true, history: filteredHistory, canExecute: access.canExecute });
  }

  const reconciliationId = params.get("reconciliationId");
  if (reconciliationId) {
    const history = await access.db.collection("paymentReconciliations").findOne({ reconciliationId });
    if (!history || !visiblePropertyIds.includes(String(history.propertyId))) return jsonError("Reconciliation not found", 404);
    return NextResponse.json({ success: true, reconciliation: history, canExecute: access.canExecute });
  }

  if (!visiblePropertyIds.length) {
    return NextResponse.json({ success: true, items: [], properties: [], landlords: [], truncated: false, canExecute: access.canExecute,
      summary: { tenants: 0, walletBalances: 0, eligibleOutstanding: 0, potentiallyMisallocated: 0, unallocatedVerifiedPayments: 0, reconciled: 0, failed: 0 } });
  }
  const tenantFilter: Record<string, any> = { propertyId: { $in: identityValues(visiblePropertyIds) } };
  if (tenantId) tenantFilter._id = new ObjectId(tenantId);
  if (search) {
    const regex = new RegExp(escapeRegex(search), "i");
    tenantFilter.$or = [{ name: regex }, { fullName: regex }, { email: regex }, { phone: regex }];
  }
  if (unit) {
    const regex = new RegExp(escapeRegex(unit), "i");
    tenantFilter.$and = [...(tenantFilter.$and || []), { $or: [{ houseNumber: regex }, { unitIdentifier: regex }, { unitType: regex }, { "leasedUnits.houseNumber": regex }, { "leasedUnits.unitIdentifier": regex }] }];
  }
  const tenants = await access.db.collection("tenants").find(tenantFilter).sort({ name: 1, _id: 1 }).limit(limit + 1).toArray();
  const truncated = tenants.length > limit;
  const selectedTenants = tenants.slice(0, limit);
  const propertyIdsForTenants = [...new Set(selectedTenants.map((tenant: any) => String(tenant.propertyId || "")).filter(Boolean))];
  const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(access.db, propertyIdsForTenants);
  const analyses = await mapWithConcurrency(selectedTenants, 12, async (tenant: any) => {
    const property = propertyById.get(String(tenant.propertyId));
    const analysis = await analyzeTenantPaymentReconciliation({
      db: access.db,
      tenant,
      property,
      landlordId: property?.ownerId ? String(property.ownerId) : null,
      rentOverrideMap,
      paymentFilters: { startDate, endDate, paymentMethod },
    });
    return analysis;
  });
  let filtered = analyses.filter((item) => {
    if ((startDate || endDate || paymentMethod) && item.matchingPaymentCount === 0) return false;
    return true;
  });
  const latestByTenant = new Map<string, any>();
  const history = await getVisibleHistory(access.db, visiblePropertyIds, requestedLandlordId, 1000);
  for (const entry of history) {
    const tenantKey = String(entry.tenantId);
    if (!latestByTenant.has(tenantKey)) latestByTenant.set(tenantKey, entry);
  }
  filtered = filtered.map((item) => {
    const latest = latestByTenant.get(item.tenantId);
    if (item.status !== "no_action" || !latest) return item;
    if (latest.status === "succeeded") return { ...item, status: "reconciled" as const };
    if (latest.status === "failed") return { ...item, status: "failed" as const };
    return item;
  });
  if (requestedStatus !== "all") filtered = filtered.filter((item) => item.status === requestedStatus);

  const summary = filtered.reduce((total, item) => ({
    tenants: total.tenants + (item.status === "ready" || item.status === "requires_review" ? 1 : 0),
    walletBalances: total.walletBalances + item.currentWalletBalance,
    eligibleOutstanding: total.eligibleOutstanding + item.eligibleOutstanding,
    potentiallyMisallocated: total.potentiallyMisallocated + item.potentiallyMisallocatedAmount,
    unallocatedVerifiedPayments: total.unallocatedVerifiedPayments + item.unallocatedVerifiedPaymentCount,
    reconciled: total.reconciled + (item.status === "reconciled" ? 1 : 0),
    failed: total.failed + (history.some((entry: any) => String(entry.tenantId) === item.tenantId && entry.status === "failed") ? 1 : 0),
  }), { tenants: 0, walletBalances: 0, eligibleOutstanding: 0, potentiallyMisallocated: 0, unallocatedVerifiedPayments: 0, reconciled: 0, failed: 0 });
  const landlords = await access.db.collection("propertyOwners").find({ role: "propertyOwner" }).project({ _id: 1, name: 1, email: 1 }).sort({ name: 1 }).limit(500).toArray();
  return NextResponse.json({
    success: true,
    items: filtered,
    properties: properties.map((property: any) => ({ id: String(property._id), name: property.name || property.propertyName || "Property", landlordId: String(property.ownerId || "") })),
    landlords: landlords.map((owner: any) => ({ id: String(owner._id), name: owner.name || owner.email || "Landlord" })),
    truncated,
    canExecute: access.canExecute,
    allocationPolicyVersion: "deposit-first-v1",
    summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [key, typeof value === "number" && key !== "tenants" && key !== "unallocatedVerifiedPayments" && key !== "reconciled" && key !== "failed" ? Math.round(value * 100) / 100 : value])),
  });
}

export async function POST(request: NextRequest) {
  const access = await resolveAccess(request, "execute");
  if (access instanceof NextResponse) return access;
  if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);
  const body = await request.json().catch(() => null);
  if (!body || body.action !== "execute" || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
    return jsonError("Select between 1 and 50 tenants to reconcile", 400);
  }
  if (typeof body.idempotencyKey !== "string" || !/^[A-Za-z0-9:_-]{12,100}$/.test(body.idempotencyKey)) return jsonError("Invalid operation key", 400);
  const seen = new Set<string>();
  for (const item of body.items) {
    if (!item || typeof item.tenantId !== "string" || !ObjectId.isValid(item.tenantId) || typeof item.previewHash !== "string" || !/^[a-f0-9]{64}$/.test(item.previewHash)) return jsonError("Each selection requires a tenant ID and current preview", 400);
    if (seen.has(item.tenantId)) return jsonError("Duplicate tenant selection", 400);
    seen.add(item.tenantId);
  }

  const requestedLandlordId = typeof body.landlordId === "string" ? body.landlordId : null;
  if (requestedLandlordId && !ObjectId.isValid(requestedLandlordId)) return jsonError("Invalid landlordId", 400);
  const properties = await resolvePropertyScope(access.db, requestedLandlordId);
  const allowedPropertyIds = new Set(properties.map((property: any) => String(property._id)));
  await ensurePaymentReconciliationIndexes(access.db);
  const results = [];
  for (const item of body.items) {
    const tenant = await access.db.collection("tenants").findOne({ _id: new ObjectId(item.tenantId) }, { projection: { _id: 1, propertyId: 1 } });
    const propertyId = String(tenant?.propertyId || "");
    if (!tenant || !allowedPropertyIds.has(propertyId)) {
      results.push({ tenantId: item.tenantId, status: "failed", failureReason: "Tenant is outside your financial scope." });
      continue;
    }
    const property = properties.find((entry: any) => String(entry._id) === propertyId);
    try {
      const result = await executeTenantPaymentReconciliation({
        db: access.db,
        client: access.client,
        tenantId: item.tenantId,
        landlordId: property?.ownerId ? String(property.ownerId) : null,
        expectedPreviewHash: item.previewHash,
        idempotencyKey: `${body.idempotencyKey}:${item.tenantId}`,
        actorId: access.userId,
        actorRole: access.role,
      });
      results.push(result);
    } catch (error) {
      const code = (error as any)?.code;
      results.push({
        tenantId: item.tenantId,
        status: code === "PREVIEW_STALE" ? "stale" : code === "REQUIRES_REVIEW" ? "requires_review" : "failed",
        failureReason: error instanceof Error ? error.message : "Reconciliation failed",
      });
    }
  }
  return NextResponse.json({ success: true, results, canExecute: access.canExecute });
}
