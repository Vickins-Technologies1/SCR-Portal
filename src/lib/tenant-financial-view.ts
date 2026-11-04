import type { Db } from "mongodb";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { identityValues, money } from "@/lib/payment-query";
import { buildTenantDuesResponse } from "@/lib/tenant-dues-response";
import { calculateTenantFinancialState, type TenantFinancialState } from "@/lib/tenant-payment-allocation";
import { resolveTenantMonthlyRentForDate } from "@/lib/utils";

export type TenantFinancialView = {
  tenant: any;
  dues: ReturnType<typeof buildTenantDuesResponse>["dues"];
  state: TenantFinancialState;
  monthsStayed: number;
  expectedMonthlyRent: number;
};

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      results[index] = await mapper(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/**
 * Build current tenant views from the authoritative financial state. This is
 * read-only and is shared by owner lists, property details, and tenant detail
 * APIs so persisted summary fields cannot produce a different balance.
 */
export async function calculateTenantFinancialViews(
  db: Db,
  tenants: any[],
  asOf = new Date(),
): Promise<TenantFinancialView[]> {
  if (!tenants.length) return [];

  const propertyIds = Array.from(new Set(tenants
    .map((tenant) => String(tenant.propertyId || "").trim())
    .filter(Boolean)));
  const [properties, rentOverrideMap] = await Promise.all([
    propertyIds.length
      ? db.collection("properties").find({ _id: { $in: identityValues(propertyIds) } } as any).toArray()
      : Promise.resolve([]),
    fetchActiveRentOverridesByPropertyIds(db, propertyIds),
  ]);
  const propertyById = new Map(properties.map((property: any) => [String(property._id), property]));

  return mapWithConcurrency(tenants, 8, async (tenant) => {
    const state = await calculateTenantFinancialState(db, tenant, {
      property: propertyById.get(String(tenant.propertyId || "")),
      asOf,
      rentOverrideMap,
    });
    const view = buildTenantDuesResponse(tenant, state, asOf, rentOverrideMap);
    return {
      tenant: {
        ...view.tenant,
        updatedAt: tenant.updatedAt,
      },
      dues: view.dues,
      state,
      monthsStayed: state.monthsStayed,
      expectedMonthlyRent: money(resolveTenantMonthlyRentForDate({ tenant, date: asOf, rentOverrideMap })),
    };
  });
}

export type TenantFinancialSummary = {
  expectedRent: number;
  rentCollected: number;
  rentOutstanding: number;
  overdueRent: number;
  expectedUtilities: number;
  utilitiesCollected: number;
  utilitiesOutstanding: number;
  overdueUtilities: number;
  expectedDeposits: number;
  depositsReceived: number;
  depositsDue: number;
  otherReceived: number;
  walletBalance: number;
  totalOutstanding: number;
  penalties: number;
};

/** Sum a set of independently calculated tenant ledgers at currency precision. */
export function summarizeTenantFinancialStates(states: Iterable<TenantFinancialState>): TenantFinancialSummary {
  const summary: TenantFinancialSummary = {
    expectedRent: 0,
    rentCollected: 0,
    rentOutstanding: 0,
    overdueRent: 0,
    expectedUtilities: 0,
    utilitiesCollected: 0,
    utilitiesOutstanding: 0,
    overdueUtilities: 0,
    expectedDeposits: 0,
    depositsReceived: 0,
    depositsDue: 0,
    otherReceived: 0,
    walletBalance: 0,
    totalOutstanding: 0,
    penalties: 0,
  };

  for (const state of states) {
    summary.expectedRent += state.rentCharged;
    summary.rentCollected += state.rentPaid;
    summary.rentOutstanding += state.rentOutstanding;
    summary.overdueRent += state.overdueRent;
    summary.expectedUtilities += state.utilitiesCharged;
    summary.utilitiesCollected += state.utilitiesPaid;
    summary.utilitiesOutstanding += state.utilitiesOutstanding;
    summary.overdueUtilities += state.overdueUtilities;
    summary.expectedDeposits += state.depositRequired;
    summary.depositsReceived += state.depositPaid;
    summary.depositsDue += state.depositOutstanding;
    summary.otherReceived += state.otherPaid;
    summary.walletBalance += state.walletBalance;
    summary.totalOutstanding += state.totalOutstanding;
    summary.penalties += state.penalties;
  }

  for (const key of Object.keys(summary) as Array<keyof TenantFinancialSummary>) {
    summary[key] = money(summary[key]);
  }
  return summary;
}
