import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin-auth";
import { ObjectId } from "mongodb";
import { calculateTenantFinancialState } from "@/lib/tenant-payment-allocation";
import { getFinancialPaymentRows } from "@/lib/financial-reporting";
import { identityValues } from "@/lib/payment-query";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:payments:view");
  if (auth instanceof NextResponse) return auth;
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || 50)));
  const { db } = await connectToDatabase();

  if (searchParams.get("type") === "deposits") {
    const tenants = await db.collection("tenants").find({}).sort({ updatedAt: -1, _id: 1 }).limit(limit).toArray();
    const propertyIds = [...new Set(tenants.map((tenant: any) => String(tenant.propertyId || "")).filter(Boolean))];
    const propertyIdentities = propertyIds.flatMap((id) => ObjectId.isValid(id) ? [id, new ObjectId(id)] : [id]);
    const properties = propertyIdentities.length
      ? await db.collection("properties").find({ _id: { $in: propertyIdentities } } as any).toArray()
      : [];
    const propertyMap = new Map(properties.map((property: any) => [String(property._id), property]));
    const states = await Promise.all(tenants.map(async (tenant: any) => ({
      tenant,
      state: await calculateTenantFinancialState(db, tenant, {
        property: propertyMap.get(String(tenant.propertyId || "")),
        asOf: new Date(),
      }),
    })));
    const paymentRows = await getFinancialPaymentRows({ tenantIds: tenants.map((tenant: any) => tenant._id), db });
    const postedLedgerRows = paymentRows.length
      ? await db.collection("financialLedger").find({
        kind: "PAYMENT_POSTED",
        sourcePaymentId: { $in: identityValues(paymentRows.map((row) => row.payment._id)) },
      }).toArray()
      : [];
    const postedLedgerByPaymentId = new Map<string, any[]>();
    for (const event of postedLedgerRows) {
      const key = String(event.sourcePaymentId);
      postedLedgerByPaymentId.set(key, [...(postedLedgerByPaymentId.get(key) || []), event]);
    }
    const allocationByPaymentId = new Map<string, any>();
    for (const { state } of states) {
      for (const [paymentId, allocation] of state.paymentAllocations) allocationByPaymentId.set(paymentId, allocation);
    }
    const allocationDifferences = paymentRows.flatMap((row) => {
      const calculated = allocationByPaymentId.get(String(row.payment._id));
      if (!calculated) return [];
      const stored = row.allocation;
      const fields = ["deposit", "rent", "utilities", "other", "walletCredit"] as const;
      const changedFields = fields.filter((field) => Math.abs(Number(stored[field] || 0) - Number(calculated[field] || 0)) > 0.01);
      if (!changedFields.length) return [];
      return [{
        paymentId: String(row.payment._id),
        tenantId: String(row.payment.tenantId || ""),
        eventDate: row.eventDate?.toISOString() || null,
        changedFields,
        storedAllocation: stored,
        calculatedAllocation: calculated,
        cause: row.payment.allocation ? "SAVED_ALLOCATION_DIFFERS_FROM_CURRENT_TENANT_LEDGER" : "LEGACY_PAYMENT_HAS_NO_SAVED_ALLOCATION",
      }];
    });
    const ledgerDifferences = paymentRows.flatMap((row) => {
      const paymentId = String(row.payment._id);
      const events = postedLedgerByPaymentId.get(paymentId) || [];
      const ledgerAmount = events.reduce((sum, event) => sum + Number(event.amount || 0), 0);
      const calculatedDeposit = Number(allocationByPaymentId.get(paymentId)?.deposit || 0);
      const ledgerDeposit = events.reduce((sum, event) => sum + Number(event.allocation?.deposit || 0), 0);
      const causes: string[] = [];
      if (!events.length) causes.push("NO_PAYMENT_POSTED_LEDGER_EVENT");
      if (events.length && Math.abs(ledgerAmount - row.originalAmount) > 0.01) causes.push("POSTED_LEDGER_AMOUNT_DIFFERS_FROM_PAYMENT_RECORD");
      if (events.length && Math.abs(ledgerDeposit - calculatedDeposit) > 0.01) causes.push("POSTED_LEDGER_DEPOSIT_ALLOCATION_DIFFERS_FROM_CURRENT_TENANT_LEDGER");
      if (!causes.length) return [];
      return [{
        paymentId,
        tenantId: String(row.payment.tenantId || ""),
        paymentAmount: row.originalAmount,
        ledgerAmount,
        calculatedDeposit,
        ledgerDeposit,
        causes,
      }];
    });
    const tenantDifferences = states.flatMap(({ tenant, state }) => {
      const differences: Array<Record<string, unknown>> = [];
      if (tenant.totalDepositPaid != null && Math.abs(Number(tenant.totalDepositPaid) - state.depositPaid) > 0.01) {
        differences.push({ field: "totalDepositPaid", stored: Number(tenant.totalDepositPaid), calculated: state.depositPaid });
      }
      if (tenant.depositOutstanding != null && Math.abs(Number(tenant.depositOutstanding) - state.depositOutstanding) > 0.01) {
        differences.push({ field: "depositOutstanding", stored: Number(tenant.depositOutstanding), calculated: state.depositOutstanding });
      }
      if (tenant.deposit != null && Math.abs(Number(tenant.deposit) - state.depositRequired) > 0.01) {
        differences.push({ field: "deposit", stored: Number(tenant.deposit), calculated: state.depositRequired });
      }
      if (!differences.length) return [];
      return [{
        tenantId: String(tenant._id),
        propertyId: tenant.propertyId || null,
        differences,
        calculated: {
          depositRequired: state.depositRequired,
          depositCollected: state.depositPaid,
          depositOutstanding: state.depositOutstanding,
        },
        cause: "TENANT_SNAPSHOT_DIFFERS_FROM_CURRENT_CONTRACT_AND_POSTED_LEDGER",
      }];
    });
    return NextResponse.json({
      success: true,
      readOnly: true,
      report: "deposit-reconciliation-dry-run",
      scannedTenants: tenants.length,
      truncated: tenants.length === limit,
      totals: states.reduce((totals, { state }) => ({
        required: Math.round((totals.required + state.depositRequired) * 100) / 100,
        collected: Math.round((totals.collected + state.depositPaid) * 100) / 100,
        outstanding: Math.round((totals.outstanding + state.depositOutstanding) * 100) / 100,
      }), { required: 0, collected: 0, outstanding: 0 }),
      tenantDifferences,
      paymentAllocationDifferences: allocationDifferences,
      postedLedgerDifferences: ledgerDifferences,
      discrepancyCounts: {
        tenants: tenantDifferences.length,
        payments: allocationDifferences.length,
        postedLedgerEvents: ledgerDifferences.length,
      },
    });
  }

  const payments = await db.collection("payments").find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  const reversals = await db.collection("financialLedger").find({ kind: "PAYMENT_REVERSED", status: "posted" }).toArray();
  const reversedByPayment = new Map<string, number>();
  for (const reversal of reversals) reversedByPayment.set(String(reversal.sourcePaymentId), (reversedByPayment.get(String(reversal.sourcePaymentId)) || 0) + Number(reversal.amount || 0));
  return NextResponse.json({
    success: true,
    readOnly: true,
    payments: payments.map((payment) => {
      const original = Number(payment.postedAmount ?? payment.amount ?? 0);
      const reversed = reversedByPayment.get(String(payment._id)) || 0;
      const allocation = payment.allocation || {};
      const allocated = ["rent", "utilities", "deposit", "other", "walletCredit"].reduce((sum, key) => sum + Number(allocation[key] || 0), 0);
      const status = payment.financialPostingStatus === "quarantined"
        ? "QUARANTINED"
        : reversed > original ? "REQUIRES_REVIEW"
        : !payment.allocation ? "UNALLOCATED"
        : allocated > original + 0.01 ? "AMOUNT_MISMATCH"
        : reversed > 0 && reversed < original ? "PARTIALLY_RECONCILED"
        : "RECONCILED";
      return {
        paymentId: String(payment._id), providerReference: payment.providerTransactionId || payment.mpesaCode || payment.reference || null,
        tenantId: payment.tenantId || null, propertyId: payment.propertyId || null,
        amount: original, postedAmount: Number(payment.postedAmount ?? payment.amount ?? 0), allocatedAmount: allocated,
        reversedAmount: reversed, credit: Number(allocation.walletCredit || 0), outstanding: Math.max(0, original - reversed - allocated),
        postingStatus: payment.financialPostingStatus || "LEGACY_REQUIRES_REVIEW", reconciliationStatus: status,
      };
    }),
  });
}

