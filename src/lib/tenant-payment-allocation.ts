import { Db, ObjectId } from "mongodb";
import { calculateFixedUtilityBreakdown, getPostedMeteredUtilityBreakdown } from "@/lib/property-utilities";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { calculateOverduePenalty, calculateTenantRentDueToDate, resolveTenantRequiredDeposit } from "@/lib/utils";

export type PaymentAllocation = {
  deposit: number;
  rent: number;
  utilities: number;
  other: number;
  walletCredit: number;
  walletApplied: number;
  utilityAllocations?: Array<{ utilityChargeId: string; billingPeriod: string; amount: number }>;
};

export type PaymentCategory = "Rent" | "Utility" | "Deposit" | "Other" | "General";

type LedgerPayment = {
  _id: ObjectId;
  amount: number;
  type?: PaymentCategory;
  status?: string;
  paymentDate?: string;
  createdAt?: string;
  allocation?: Partial<PaymentAllocation>;
};

export type TenantFinancialState = {
  depositRequired: number;
  depositPaid: number;
  depositOutstanding: number;
  rentCharged: number;
  rentPaid: number;
  rentOutstanding: number;
  utilitiesCharged: number;
  utilitiesPaid: number;
  utilitiesOutstanding: number;
  utilitiesCurrentOutstanding: number;
  utilitiesOverdueOutstanding: number;
  utilityStatus: "CURRENT" | "OVERDUE" | "PAID";
  overdueRent: number;
  overdueUtilities: number;
  penalties: number;
  overdueAmount: number;
  totalOutstanding: number;
  walletBalance: number;
  paymentAllocations: Map<string, PaymentAllocation>;
};

/**
 * Aggregates the deposit contribution of already-calculated tenant states.
 * Keeping this small operation separate makes dashboard/report consumers use
 * the ledger result rather than reinterpreting raw payment types.
 */
export function sumTenantDepositPaid(states: Iterable<Pick<TenantFinancialState, "depositPaid">>) {
  let total = 0;
  for (const state of states) total += amountOf(state.depositPaid);
  return money(total);
}

export function sumTenantOverdueAmount(
  states: Iterable<Pick<TenantFinancialState, "overdueRent" | "overdueUtilities">>
) {
  let total = 0;
  for (const state of states) total += amountOf(state.overdueRent) + amountOf(state.overdueUtilities);
  return money(total);
}

const money = (value: number) => Math.round(Math.max(0, value) * 100) / 100;
const amountOf = (value: unknown) => (Number.isFinite(Number(value)) ? money(Number(value)) : 0);

export function allocatePaymentLedger(params: {
  depositDue?: number;
  rentDue: number;
  utilityDue: number;
  otherDue?: number;
  walletBalance?: number;
  payments: LedgerPayment[];
}) {
  let rentPaid = 0;
  let depositPaid = 0;
  let utilitiesPaid = 0;
  let otherPaid = 0;
  let wallet = amountOf(params.walletBalance);
  const allocations = new Map<string, PaymentAllocation>();
  const rentDue = amountOf(params.rentDue);
  const depositDue = amountOf(params.depositDue);
  const utilityDue = amountOf(params.utilityDue);
  const otherDue = amountOf(params.otherDue);

  for (const payment of params.payments.filter((entry) => entry.status === "completed")) {
    const paymentAmount = amountOf(payment.amount);
    const previousWallet = wallet;
    const category = payment.type;
    let deposit = 0;
    let rent = 0;
    let utilities = 0;
    let other = 0;
    let funds = paymentAmount;
    let walletApplied = 0;

    // Explicit categories are authoritative. They may create wallet credit
    // when overpaid, but they must never be silently redirected to another
    // obligation. Missing type is retained as the legacy/general policy so
    // historical records are not reinterpreted without evidence.
    if (category === "Deposit") {
      deposit = Math.min(Math.max(0, depositDue - depositPaid), funds);
    } else if (category === "Rent") {
      rent = Math.min(Math.max(0, rentDue - rentPaid), funds);
    } else if (category === "Utility") {
      utilities = Math.min(Math.max(0, utilityDue - utilitiesPaid), funds);
    } else if (category === "Other") {
      other = Math.min(Math.max(0, otherDue - otherPaid), funds);
    } else {
      // General/legacy payments follow the established deterministic order.
      deposit = Math.min(Math.max(0, depositDue - depositPaid), funds);
      funds = previousWallet + paymentAmount - deposit;
      rent = Math.min(Math.max(0, rentDue - rentPaid), funds);
      funds -= rent;
      utilities = Math.min(Math.max(0, utilityDue - utilitiesPaid), funds);
      funds -= utilities;
      other = Math.min(Math.max(0, otherDue - otherPaid), funds);
      funds -= other;
      walletApplied = Math.min(previousWallet, rent + utilities + other);
    }
    if (category === "Deposit" || category === "Rent" || category === "Utility" || category === "Other") {
      funds = paymentAmount - deposit - rent - utilities - other;
      wallet = money(previousWallet + Math.max(0, funds));
    } else {
      wallet = money(funds);
    }
    depositPaid += deposit;
    rentPaid += rent;
    utilitiesPaid += utilities;
    otherPaid += other;
    wallet = money(funds);
    allocations.set(payment._id.toString(), {
      deposit: money(deposit),
      rent: money(rent),
      utilities: money(utilities),
      other: money(other),
      walletCredit: money(Math.max(0, paymentAmount - deposit - rent - utilities - other + walletApplied)),
      walletApplied: money(walletApplied),
    });
  }
  return { depositPaid: money(depositPaid), rentPaid: money(rentPaid), utilitiesPaid: money(utilitiesPaid), otherPaid: money(otherPaid), walletBalance: wallet, allocations };
}

/**
 * The single financial source of truth. Consumers should aggregate this state
 * instead of subtracting payment-type totals from raw lease values.
 */
export async function calculateTenantFinancialState(
  db: Db,
  tenant: any,
  options: { asOf?: Date; property?: any; rentOverrideMap?: Map<string, any> } = {}
): Promise<TenantFinancialState> {
  const asOf = options.asOf ?? new Date();
  const property = options.property ?? (ObjectId.isValid(String(tenant.propertyId))
    ? await db.collection("properties").findOne({ _id: new ObjectId(String(tenant.propertyId)) })
    : null);
  const overrides = options.rentOverrideMap ?? await fetchActiveRentOverridesByPropertyIds(db, [String(tenant.propertyId)]);
  const { rentDue } = calculateTenantRentDueToDate({ tenant, today: asOf, rentOverrideMap: overrides });
  const fixedUtilities = calculateFixedUtilityBreakdown({
    utilities: property?.utilities,
    tenant,
    today: asOf,
    paymentDay: property?.rentPaymentDate,
  });
  const meteredUtilities = await getPostedMeteredUtilityBreakdown(
    db,
    String(tenant._id),
    asOf,
    property?.rentPaymentDate
  );
  const utilityDue = money(fixedUtilities.charged + meteredUtilities.charged);
  const utilityOverdueCharged = money(fixedUtilities.overdueCharged + meteredUtilities.overdueCharged);
  const depositDue = money(resolveTenantRequiredDeposit({ tenant, unitTypes: property?.unitTypes }));
  const cutoff = asOf.getTime();
  const payments = await db.collection<LedgerPayment>("payments")
    .find({ tenantId: { $in: [String(tenant._id), tenant._id] }, status: "completed" })
    .toArray();
  const eligiblePayments = payments
    .filter((payment) => {
      const date = payment.paymentDate ?? payment.createdAt;
      return !date || Number.isNaN(new Date(date).getTime()) || new Date(date).getTime() <= cutoff;
    })
    .sort((a, b) => new Date(a.paymentDate ?? a.createdAt ?? 0).getTime() - new Date(b.paymentDate ?? b.createdAt ?? 0).getTime());
  const ledger = allocatePaymentLedger({
    depositDue,
    rentDue,
    utilityDue,
    otherDue: 0,
    walletBalance: 0,
    payments: eligiblePayments,
  });
  const penalties = money(calculateOverduePenalty({
    rentDues: money(Math.max(0, rentDue - ledger.rentPaid)),
    today: asOf,
    rentPaymentDate: property?.rentPaymentDate,
    leaseStartDate: tenant.leaseStartDate,
    penaltyAmount: property?.penaltyAmount,
    penaltyFrequency: property?.penaltyFrequency,
  }));
  const depositOutstanding = money(Math.max(0, depositDue - ledger.depositPaid));
  const rentOutstanding = money(Math.max(0, rentDue - ledger.rentPaid));
  const utilitiesOutstanding = money(Math.max(0, utilityDue - ledger.utilitiesPaid));
  const utilitiesOverdueOutstanding = money(Math.min(utilitiesOutstanding, Math.max(0, utilityOverdueCharged - ledger.utilitiesPaid)));
  const utilitiesCurrentOutstanding = money(Math.max(0, utilitiesOutstanding - utilitiesOverdueOutstanding));
  // Rent and utilities are calculated through today's due-date rules above,
  // so their outstanding balances are the genuinely overdue components.
  // Deposits and penalties remain part of totalOutstanding, but are not part
  // of the dashboard's overdue-amount metric.
  const overdueRent = rentOutstanding;
  const overdueUtilities = utilitiesOverdueOutstanding;
  return {
    depositRequired: depositDue,
    depositPaid: ledger.depositPaid,
    depositOutstanding,
    rentCharged: money(rentDue),
    rentPaid: ledger.rentPaid,
    rentOutstanding,
    utilitiesCharged: utilityDue,
    utilitiesPaid: ledger.utilitiesPaid,
    utilitiesOutstanding,
    utilitiesCurrentOutstanding,
    utilitiesOverdueOutstanding,
    utilityStatus: utilitiesOutstanding <= 0 ? "PAID" : utilitiesOverdueOutstanding > 0 ? "OVERDUE" : "CURRENT",
    overdueRent,
    overdueUtilities,
    penalties,
    overdueAmount: money(overdueRent + overdueUtilities),
    totalOutstanding: money(depositOutstanding + rentOutstanding + utilitiesOutstanding + penalties),
    walletBalance: ledger.walletBalance,
    paymentAllocations: ledger.allocations,
  };
}

export async function reconcileTenantPaymentAllocation(db: Db, tenantId: string) {
  if (!ObjectId.isValid(tenantId)) return null;
  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId) });
  if (!tenant) return null;

  const property = ObjectId.isValid(String(tenant.propertyId))
    ? await db.collection("properties").findOne({ _id: new ObjectId(String(tenant.propertyId)) })
    : null;
  const today = new Date();
  const state = await calculateTenantFinancialState(db, tenant, { asOf: today, property });
  const allocations = state.paymentAllocations;
  const depositPaid = state.depositPaid;
  const rentPaid = state.rentPaid;
  const utilitiesPaid = state.utilitiesPaid;
  const otherPaid = 0;
  const wallet = state.walletBalance;

  for (const [paymentId, allocation] of allocations) {
    if (ObjectId.isValid(paymentId)) {
      await db.collection("payments").updateOne({ _id: new ObjectId(paymentId) }, { $set: { allocation } });
    }
  }

  // Metered utility payments are also projected onto concrete posted charges,
  // oldest billing period first. The category allocation above remains the
  // authoritative tenant total; this mapping makes the period-level audit
  // trail deterministic without changing fixed-utility behaviour.
  const utilityCharges = await db.collection("utilityCharges")
    .find({ tenantId, status: "posted" })
    .sort({ billingPeriod: 1, createdAt: 1, _id: 1 })
    .toArray();
  const chargeRemaining = new Map(utilityCharges.map((charge: any) => [String(charge._id), Math.max(0, Number(charge.amount) || 0)]));
  for (const payment of await db.collection("payments")
    .find({ tenantId: { $in: [tenantId, new ObjectId(tenantId)] }, status: "completed", type: "Utility" })
    .sort({ paymentDate: 1, createdAt: 1, _id: 1 })
    .toArray()) {
    let remaining = Math.max(0, Number(allocations.get(String(payment._id))?.utilities || 0));
    const utilityAllocations: Array<{ utilityChargeId: string; billingPeriod: string; amount: number }> = [];
    for (const charge of utilityCharges) {
      if (remaining <= 0) break;
      const chargeId = String(charge._id);
      const available = chargeRemaining.get(chargeId) || 0;
      if (available <= 0) continue;
      const applied = money(Math.min(available, remaining));
      chargeRemaining.set(chargeId, money(available - applied));
      remaining = money(remaining - applied);
      utilityAllocations.push({ utilityChargeId: chargeId, billingPeriod: String(charge.billingPeriod || ""), amount: applied });
    }
    await db.collection("payments").updateOne({ _id: payment._id }, { $set: { utilityAllocations } });
  }

  const rentOutstanding = state.rentOutstanding;
  const utilitiesOutstanding = state.utilitiesOutstanding;
  const depositOutstanding = state.depositOutstanding;
  const otherOutstanding = 0;
  const totalOutstanding = state.totalOutstanding;
  await db.collection("tenants").updateOne(
    { _id: new ObjectId(tenantId) },
    { $set: {
      totalRentPaid: money(rentPaid),
      totalUtilityPaid: money(utilitiesPaid),
      totalDepositPaid: money(depositPaid),
      walletBalance: money(wallet),
      paymentStatus: totalOutstanding > 0 ? "overdue" : "up-to-date",
      updatedAt: today.toISOString(),
    } }
  );

  return {
    rentPaid: money(rentPaid),
    utilityPaid: money(utilitiesPaid),
    depositPaid: money(depositPaid),
    otherPaid: money(otherPaid),
    walletBalance: money(wallet),
    rentDue: state.rentCharged,
    utilityDue: state.utilitiesCharged,
    depositDue: state.depositRequired,
    rentOutstanding,
    utilitiesOutstanding,
    utilitiesCurrentOutstanding: state.utilitiesCurrentOutstanding,
    utilitiesOverdueOutstanding: state.utilitiesOverdueOutstanding,
    utilityStatus: state.utilityStatus,
    depositOutstanding,
    otherOutstanding,
    totalOutstanding,
  };
}
