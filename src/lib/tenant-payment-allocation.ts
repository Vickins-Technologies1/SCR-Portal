import { Db, ObjectId } from "mongodb";
import { calculateFixedUtilityDue, getPostedMeteredUtilityTotal } from "@/lib/property-utilities";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { calculateTenantRentDueToDate, resolveTenantRequiredDeposit } from "@/lib/utils";

export type PaymentAllocation = {
  deposit: number;
  rent: number;
  utilities: number;
  other: number;
  walletCredit: number;
  walletApplied: number;
};

type LedgerPayment = {
  _id: ObjectId;
  amount: number;
  type?: "Rent" | "Utility" | "Deposit" | "Other";
  status?: string;
  paymentDate?: string;
  createdAt?: string;
  allocation?: Partial<PaymentAllocation>;
};

const money = (value: number) => Math.round(Math.max(0, value) * 100) / 100;
const amountOf = (value: unknown) => (Number.isFinite(Number(value)) ? money(Number(value)) : 0);

const emptyAllocation = (): PaymentAllocation => ({
  deposit: 0,
  rent: 0,
  utilities: 0,
  other: 0,
  walletCredit: 0,
  walletApplied: 0,
});

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
  let wallet = 0;
  const allocations = new Map<string, PaymentAllocation>();
  const rentDue = amountOf(params.rentDue);
  const depositDue = amountOf(params.depositDue);
  const utilityDue = amountOf(params.utilityDue);
  const otherDue = amountOf(params.otherDue);

  for (const payment of params.payments) {
    const paymentAmount = amountOf(payment.amount);
    const previousWallet = wallet;
    // Deposit is funded only by this payment. Existing wallet credit is never
    // borrowed to settle, reduce, or rewrite the one-time deposit.
    const deposit = Math.min(Math.max(0, depositDue - depositPaid), paymentAmount);
    let funds = previousWallet + paymentAmount - deposit;
    const rent = Math.min(Math.max(0, rentDue - rentPaid), funds);
    funds -= rent;
    const utilities = Math.min(Math.max(0, utilityDue - utilitiesPaid), funds);
    funds -= utilities;
    const other = Math.min(Math.max(0, otherDue - otherPaid), funds);
    funds -= other;
    const walletApplied = Math.min(previousWallet, rent + utilities + other);
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
      walletCredit: money(Math.max(0, paymentAmount - deposit - rent - utilities - other)),
      walletApplied: money(walletApplied),
    });
  }
  return { depositPaid: money(depositPaid), rentPaid: money(rentPaid), utilitiesPaid: money(utilitiesPaid), otherPaid: money(otherPaid), walletBalance: wallet, allocations };
}

export async function reconcileTenantPaymentAllocation(db: Db, tenantId: string) {
  if (!ObjectId.isValid(tenantId)) return null;
  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId) });
  if (!tenant) return null;

  const property = ObjectId.isValid(String(tenant.propertyId))
    ? await db.collection("properties").findOne({ _id: new ObjectId(String(tenant.propertyId)) })
    : null;
  const today = new Date();
  const overrides = await fetchActiveRentOverridesByPropertyIds(db, [String(tenant.propertyId)]);
  const { rentDue } = calculateTenantRentDueToDate({ tenant: tenant as any, today, rentOverrideMap: overrides });
  const utilityDue = money(
    calculateFixedUtilityDue({ utilities: (property as any)?.utilities, tenant: tenant as any, today }) +
      (await getPostedMeteredUtilityTotal(db, tenantId))
  );
  const depositDue = money(resolveTenantRequiredDeposit({ tenant: tenant as any, unitTypes: (property as any)?.unitTypes }));

  const payments = await db.collection<LedgerPayment>("payments")
    .find({ tenantId, status: "completed" })
    .sort({ paymentDate: 1, createdAt: 1, _id: 1 })
    .toArray();

  const allocations = new Map<string, PaymentAllocation>();
  const ledger = allocatePaymentLedger({ depositDue, rentDue, utilityDue, otherDue: 0, walletBalance: 0, payments });
  const depositPaid = ledger.depositPaid;
  const rentPaid = ledger.rentPaid;
  const utilitiesPaid = ledger.utilitiesPaid;
  const otherPaid = ledger.otherPaid;
  const wallet = ledger.walletBalance;
  for (const [id, allocation] of ledger.allocations) allocations.set(id, allocation);

  for (const payment of payments) {
    const allocation = allocations.get(payment._id.toString());
    if (allocation) {
      await db.collection("payments").updateOne({ _id: payment._id }, { $set: { allocation } });
    }
  }

  const rentOutstanding = money(Math.max(0, rentDue - rentPaid));
  const utilitiesOutstanding = money(Math.max(0, utilityDue - utilitiesPaid));
  const depositOutstanding = money(Math.max(0, depositDue - depositPaid));
  const otherOutstanding = 0;
  const totalOutstanding = money(depositOutstanding + rentOutstanding + utilitiesOutstanding + otherOutstanding);
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
    rentDue: money(rentDue),
    utilityDue,
    depositDue,
    rentOutstanding,
    utilitiesOutstanding,
    depositOutstanding,
    otherOutstanding,
    totalOutstanding,
  };
}
