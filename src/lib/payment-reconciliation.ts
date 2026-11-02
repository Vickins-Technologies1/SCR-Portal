import { createHash, randomUUID } from "node:crypto";
import { ClientSession, Db, MongoClient, ObjectId } from "mongodb";
import { getFinancialPaymentRows, reconcileInvoiceFinancialState } from "@/lib/financial-reporting";
import { identityValues, isSuccessfulPaymentStatus, paymentEventDate } from "@/lib/payment-query";
import { calculateTenantFinancialState, PaymentAllocation, reconcileTenantPaymentAllocation } from "@/lib/tenant-payment-allocation";

const roundMoney = (value: unknown) => {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
};
const closeEnough = (left: unknown, right: unknown) => Math.abs(roundMoney(left) - roundMoney(right)) < 0.01;
const allocationFields = ["deposit", "rent", "utilities", "other", "walletCredit"] as const;
type AllocationField = typeof allocationFields[number];

export type ReconciliationStatus = "requires_review" | "ready" | "reconciled" | "no_action" | "failed";

export type ReconciliationAllocationProposal = {
  paymentId: string;
  reference: string | null;
  date: string | null;
  amount: number;
  previousAllocation: Partial<PaymentAllocation> | null;
  proposedAllocation: PaymentAllocation;
  allocationChanges: AllocationField[];
  walletDebitToPost: number;
  walletAllocation: Partial<Record<"deposit" | "rent" | "utilities" | "other", number>>;
};

export type TenantPaymentReconciliationAnalysis = {
  tenantId: string;
  landlordId: string | null;
  propertyId: string | null;
  tenantName: string;
  propertyName: string;
  unit: string;
  currentWalletBalance: number;
  expectedWalletBalance: number;
  existingWalletCredits: number;
  existingWalletDebits: number;
  verifiedPaymentAmount: number;
  totalPaymentAllocationAmount: number;
  outstandingRent: number;
  outstandingUtilities: number;
  eligibleDeposit: number;
  otherEligibleCharges: number;
  eligibleOutstanding: number;
  potentiallyMisallocatedAmount: number;
  walletAmountToAllocate: number;
  verifiedPaymentCount: number;
  unallocatedVerifiedPaymentCount: number;
  pendingPaymentCount: number;
  reversedOrRefundedPaymentCount: number;
  duplicatePaymentCount: number;
  allocationMismatchCount: number;
  walletBalanceMismatch: boolean;
  issues: string[];
  proposals: ReconciliationAllocationProposal[];
  status: ReconciliationStatus;
  previewHash: string;
  snapshot: Record<string, number>;
  blockingIssues: string[];
  matchingPaymentCount: number;
};

export function makeReconciliationPreviewHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function allocationObject(value: any): Partial<PaymentAllocation> | null {
  if (!value || typeof value !== "object") return null;
  const result: Partial<PaymentAllocation> = {};
  for (const field of allocationFields) result[field] = roundMoney(value[field]);
  result.walletApplied = roundMoney(value.walletApplied);
  return result;
}

function unitForTenant(tenant: any) {
  if (Array.isArray(tenant.leasedUnits) && tenant.leasedUnits.length) {
    return tenant.leasedUnits.map((unit: any) => unit.houseNumber || unit.unitIdentifier || unit.unitType).filter(Boolean).join(", ");
  }
  return String(tenant.houseNumber || tenant.unitIdentifier || tenant.unitType || "—");
}

function paymentReference(payment: any) {
  return payment.providerTransactionId || payment.mpesaCode || payment.transactionId || payment.reference || null;
}

export async function analyzeTenantPaymentReconciliation(params: {
  db: Db;
  tenant: any;
  property?: any;
  landlordId?: string | null;
  rentOverrideMap?: Map<string, any>;
  session?: ClientSession;
  paymentFilters?: { startDate?: string; endDate?: string; paymentMethod?: string };
}): Promise<TenantPaymentReconciliationAnalysis> {
  const { db, tenant, session } = params;
  const tenantId = String(tenant._id);
  const property = params.property ?? null;
  const options = session ? { session } : undefined;
  const [state, rows, allPayments, utilityCharges] = await Promise.all([
    calculateTenantFinancialState(db, tenant, {
      asOf: new Date(),
      property,
      rentOverrideMap: params.rentOverrideMap,
      session,
    }),
    getFinancialPaymentRows({ db, tenantIds: [tenant._id], session }),
    db.collection("payments")
      .find({ tenantId: { $in: identityValues(tenant._id) } }, options)
      .sort({ paymentDate: 1, createdAt: 1, _id: 1 })
      .limit(5000)
      .toArray(),
    db.collection("utilityCharges")
      .find({ tenantId: { $in: identityValues(tenant._id) }, status: "posted" }, options)
      .sort({ billingPeriod: 1, createdAt: 1, _id: 1 })
      .limit(5000)
      .toArray(),
  ]);

  const paymentIds = rows.map((row) => row.payment._id);
  const allPaymentIds = new Set(allPayments.map((payment: any) => String(payment._id)));
  const walletEntries = await db.collection("walletTransactions")
    .find({ tenantId: { $in: identityValues(tenant._id) } }, options)
    .sort({ createdAt: 1, eventKey: 1 })
    .toArray();
  const consumedByPayment = new Map<string, number>();
  for (const entry of walletEntries) {
    if (entry.kind !== "CREDIT_CONSUMED") continue;
    const key = String(entry.sourcePaymentId);
    consumedByPayment.set(key, roundMoney((consumedByPayment.get(key) || 0) + roundMoney(entry.amount)));
  }

  const duplicateConditions: Record<string, unknown>[] = [];
  for (const { payment } of rows) {
    const provider = String(payment.provider || "").trim();
    const providerTransactionId = String(payment.providerTransactionId || "").trim();
    const mpesaCode = String(payment.mpesaCode || "").trim();
    if (provider && providerTransactionId) duplicateConditions.push({ provider, providerTransactionId });
    if (provider && mpesaCode) duplicateConditions.push({ provider, mpesaCode });
  }
  const duplicateRows = duplicateConditions.length
    ? await db.collection("payments").find({
        _id: { $nin: paymentIds },
        $or: duplicateConditions,
      }, options).project({ _id: 1, provider: 1, providerTransactionId: 1, mpesaCode: 1 }).toArray()
    : [];
  const providerReferenceKeys = (payment: any) => [...new Set([payment.providerTransactionId, payment.mpesaCode]
    .filter(Boolean)
    .map((reference: unknown) => `${String(payment.provider || "").trim().toLowerCase()}:${String(reference).trim().toLowerCase()}`))];
  const duplicateIdentitySet = new Set(duplicateRows.flatMap((row: any) => providerReferenceKeys(row)));
  const localPaymentIdsByReference = new Map<string, string[]>();
  for (const { payment } of rows) {
    for (const key of providerReferenceKeys(payment)) {
      localPaymentIdsByReference.set(key, [...(localPaymentIdsByReference.get(key) || []), String(payment._id)]);
    }
  }
  const duplicatePaymentIds = new Set([...localPaymentIdsByReference.values()].filter((ids) => ids.length > 1).flat());

  const postedLedgerRows = paymentIds.length
    ? await db.collection("financialLedger").find({
        kind: "PAYMENT_POSTED",
        status: "posted",
        sourcePaymentId: { $in: identityValues(paymentIds) },
      } as any, options).sort({ sourcePaymentId: 1, eventKey: 1 }).toArray()
    : [];
  const postedLedgerByPayment = new Map<string, any[]>();
  for (const event of postedLedgerRows) {
    const key = String(event.sourcePaymentId);
    postedLedgerByPayment.set(key, [...(postedLedgerByPayment.get(key) || []), event]);
  }

  const invoicesById = new Map<string, any>();
  const invoiceIds = [...new Set(rows.map((row) => String(row.payment.invoiceId || "")).filter((id) => ObjectId.isValid(id)))];
  if (invoiceIds.length) {
    const invoiceIdsWithIdentity = invoiceIds.flatMap((id) => [id, new ObjectId(id)]);
    const invoices = await db.collection("invoices").find({ _id: { $in: invoiceIdsWithIdentity } } as any, options).project({ _id: 1, status: 1 }).toArray();
    for (const invoice of invoices) invoicesById.set(String(invoice._id), invoice);
  }

  const proposals: ReconciliationAllocationProposal[] = [];
  const blockingIssues = new Set<string>();
  const issueSet = new Set<string>();
  let duplicatePaymentCount = 0;
  let allocationMismatchCount = 0;
  let unallocatedVerifiedPaymentCount = 0;
  let walletAmountToAllocate = 0;
  let unallocatedReceiptsAllocatedToDues = 0;
  const eligiblePaymentIds = new Set(paymentIds.map(String));
  const allocatedPaymentIds = new Set(state.paymentAllocations.keys());
  for (const entry of walletEntries) {
    if (entry.kind !== "CREDIT_CONSUMED") continue;
    const sourceId = entry.sourcePaymentId ? String(entry.sourcePaymentId) : "";
    if (!sourceId || !allPaymentIds.has(sourceId) || !eligiblePaymentIds.has(sourceId) || !allocatedPaymentIds.has(sourceId)) {
      blockingIssues.add("ORPHANED_WALLET_DEBIT");
    }
  }

  for (const row of rows) {
    const payment = row.payment;
    const paymentId = String(payment._id);
    const calculated = state.paymentAllocations.get(paymentId);
    if (!calculated) continue;
    const stored = allocationObject(payment.allocation);
    const changes = allocationFields.filter((field) => !closeEnough(stored?.[field], calculated[field]));
    const missingSnapshot = !payment.allocation;
    if (missingSnapshot) {
      unallocatedReceiptsAllocatedToDues = roundMoney(unallocatedReceiptsAllocatedToDues + allocationFields
        .filter((field) => field !== "walletCredit")
        .reduce((sum, field) => sum + roundMoney(calculated[field]), 0));
    }
    if (changes.length || missingSnapshot) allocationMismatchCount += 1;
    if (missingSnapshot || roundMoney(allocationFields.reduce((sum, field) => sum + roundMoney(stored?.[field]), 0)) + 0.01 < row.netAmount) {
      unallocatedVerifiedPaymentCount += 1;
      issueSet.add("UNALLOCATED_VERIFIED_PAYMENT");
    }

    const walletDebitToPost = roundMoney(Math.max(0, roundMoney(calculated.walletApplied) - (consumedByPayment.get(paymentId) || 0)));
    walletAmountToAllocate = roundMoney(walletAmountToAllocate + walletDebitToPost);
    const existingDebit = consumedByPayment.get(paymentId) || 0;
    if (existingDebit > 0 && !closeEnough(existingDebit, calculated.walletApplied)) {
      blockingIssues.add("EXISTING_WALLET_DEBIT_DIFFERS_FROM_CURRENT_ALLOCATION");
    }
    if (walletDebitToPost > 0) issueSet.add("WALLET_CREDIT_CAN_SETTLE_ELIGIBLE_DUES");

    const duplicate = duplicatePaymentIds.has(paymentId) || providerReferenceKeys(payment).some((key) => duplicateIdentitySet.has(key));
    if (duplicate) {
      duplicatePaymentCount += 1;
      blockingIssues.add("DUPLICATE_PROVIDER_REFERENCE");
    }
    if (row.reversedAmount > row.originalAmount + 0.01) blockingIssues.add("REVERSALS_EXCEED_PAYMENT_AMOUNT");

    const allocationTotal = allocationFields.reduce((sum, field) => sum + roundMoney(calculated[field]), 0);
    if (allocationTotal > row.netAmount + 0.01) blockingIssues.add("CALCULATED_ALLOCATION_EXCEEDS_NET_PAYMENT");
    const savedAllocationTotal = allocationFields.reduce((sum, field) => sum + roundMoney(payment.allocation?.[field]), 0);
    if (savedAllocationTotal > row.netAmount + 0.01) blockingIssues.add("SAVED_ALLOCATION_EXCEEDS_NET_PAYMENT");
    if (payment.propertyId && String(payment.propertyId) !== String(tenant.propertyId)) blockingIssues.add("PAYMENT_PROPERTY_LINK_MISMATCH");
    if (payment.landlordId && property?.ownerId && String(payment.landlordId) !== String(property.ownerId)) blockingIssues.add("PAYMENT_LANDLORD_LINK_MISMATCH");

    const postedLedgerEvents = postedLedgerByPayment.get(paymentId) || [];
    if ((payment.financialPostingStatus === "posted" || payment.financialEffectsApplied === true) && !postedLedgerEvents.length) {
      blockingIssues.add("MISSING_POSTED_PAYMENT_REFERENCE");
    }
    if (postedLedgerEvents.length > 1 || postedLedgerEvents.some((event) => !closeEnough(event.amount, row.originalAmount))) {
      blockingIssues.add("POSTED_PAYMENT_REFERENCE_MISMATCH");
    }

    const invoice = payment.invoiceId ? invoicesById.get(String(payment.invoiceId)) : null;
    if (invoice && isIneligibleInvoiceStatus(invoice.status)) {
      issueSet.add("INELIGIBLE_INVOICE_NOT_UPDATED");
    }

    if (changes.length || missingSnapshot || walletDebitToPost > 0) {
      proposals.push({
        paymentId,
        reference: paymentReference(payment) ? String(paymentReference(payment)) : null,
        date: row.eventDate?.toISOString() || null,
        amount: row.netAmount,
        previousAllocation: stored,
        proposedAllocation: calculated,
        allocationChanges: changes,
        walletDebitToPost,
        walletAllocation: {
          deposit: roundMoney(calculated.walletAllocation?.deposit),
          rent: roundMoney(calculated.walletAllocation?.rent),
          utilities: roundMoney(calculated.walletAllocation?.utilities),
          other: roundMoney(calculated.walletAllocation?.other),
        },
      });
    }
  }

  const pendingPaymentCount = allPayments.filter((payment: any) => String(payment.status || "").toLowerCase().startsWith("pending")).length;
  const matchingPaymentCount = allPayments.filter((payment: any) => {
    if (params.paymentFilters?.paymentMethod && String(payment.paymentMethod || payment.provider || "").toLowerCase() !== params.paymentFilters.paymentMethod.toLowerCase()) return false;
    const date = paymentEventDate(payment);
    const dateKey = date?.toISOString().slice(0, 10) || "";
    if (params.paymentFilters?.startDate && (!dateKey || dateKey < params.paymentFilters.startDate)) return false;
    if (params.paymentFilters?.endDate && (!dateKey || dateKey > params.paymentFilters.endDate)) return false;
    return true;
  }).length;
  const reversedOrRefundedPaymentCount = allPayments.filter((payment: any) => {
    const status = String(payment.status || "").toLowerCase();
    return status === "reversed" || status === "refunded" || status === "refund";
  }).length + rows.filter((row) => row.reversedAmount > 0).length;
  if (pendingPaymentCount) issueSet.add("PENDING_PAYMENTS_EXCLUDED");
  if (reversedOrRefundedPaymentCount) issueSet.add("REVERSED_OR_REFUNDED_PAYMENTS_EXCLUDED");
  for (const payment of allPayments) {
    if (isSuccessfulPaymentStatus(payment.status) && payment.financialPostingStatus === "quarantined") {
      blockingIssues.add("VERIFIED_PAYMENT_QUARANTINED");
    }
    if (isSuccessfulPaymentStatus(payment.status) && ["processing", "pending"].includes(String(payment.financialPostingStatus || ""))) {
      blockingIssues.add("PAYMENT_POSTING_IN_PROGRESS");
    }
  }

  const expectedPropertyId = property?._id ? String(property._id) : String(tenant.propertyId || "");
  if (!expectedPropertyId || String(tenant.propertyId || "") !== expectedPropertyId) blockingIssues.add("TENANT_PROPERTY_LINK_MISMATCH");
  if (params.landlordId && property && String(property.ownerId) !== params.landlordId) blockingIssues.add("PROPERTY_LANDLORD_LINK_MISMATCH");

  const currentWalletBalance = roundMoney(tenant.walletBalance);
  const expectedWalletBalance = roundMoney(state.walletBalance);
  const existingWalletCredits = roundMoney(walletEntries.filter((entry: any) => entry.direction === "CREDIT").reduce((sum, entry: any) => sum + roundMoney(entry.amount), 0));
  const existingWalletDebits = roundMoney(walletEntries.filter((entry: any) => entry.direction === "DEBIT").reduce((sum, entry: any) => sum + roundMoney(entry.amount), 0));
  const verifiedPaymentAmount = roundMoney(rows.reduce((sum, row) => sum + row.netAmount, 0));
  const totalPaymentAllocationAmount = roundMoney([...state.paymentAllocations.values()].reduce((sum, allocation) => sum + allocationFields.reduce((rowSum, field) => rowSum + roundMoney(allocation[field]), 0), 0));
  const walletBalanceMismatch = !closeEnough(currentWalletBalance, expectedWalletBalance);
  if (walletBalanceMismatch) issueSet.add("WALLET_BALANCE_DIFFERS_FROM_LEDGER");

  const currentTotals = {
    rentPaid: roundMoney(tenant.totalRentPaid),
    utilitiesPaid: roundMoney(tenant.totalUtilityPaid),
    depositPaid: roundMoney(tenant.totalDepositPaid),
  };
  if (tenant.totalRentPaid != null && !closeEnough(currentTotals.rentPaid, state.rentPaid)) issueSet.add("RENT_PROJECTION_DIFFERS_FROM_LEDGER");
  if (tenant.totalUtilityPaid != null && !closeEnough(currentTotals.utilitiesPaid, state.utilitiesPaid)) issueSet.add("UTILITY_PROJECTION_DIFFERS_FROM_LEDGER");
  if (tenant.totalDepositPaid != null && !closeEnough(currentTotals.depositPaid, state.depositPaid)) issueSet.add("DEPOSIT_PROJECTION_DIFFERS_FROM_CONTRACT");
  const walletBalanceDelta = roundMoney(Math.max(0, currentWalletBalance - expectedWalletBalance));
  const attributableWalletReduction = roundMoney(state.walletApplied + unallocatedReceiptsAllocatedToDues);
  if (roundMoney(expectedWalletBalance - currentWalletBalance) > 0.01) {
    blockingIssues.add("WALLET_BALANCE_BELOW_EXPECTED_LEDGER");
  }
  if (walletBalanceDelta > attributableWalletReduction + 0.01) {
    blockingIssues.add("WALLET_BALANCE_REDUCTION_HAS_NO_PAYMENT_SOURCE");
    issueSet.add("WALLET_BALANCE_REDUCTION_HAS_NO_PAYMENT_SOURCE");
  }
  for (const issue of blockingIssues) issueSet.add(issue);
  const potentiallyMisallocatedAmount = roundMoney(Math.max(walletBalanceDelta, walletAmountToAllocate));
  const requiresAction = proposals.length > 0 || walletBalanceMismatch || issueSet.has("RENT_PROJECTION_DIFFERS_FROM_LEDGER") || issueSet.has("UTILITY_PROJECTION_DIFFERS_FROM_LEDGER") || issueSet.has("DEPOSIT_PROJECTION_DIFFERS_FROM_CONTRACT");
  const status: ReconciliationStatus = blockingIssues.size ? "requires_review" : requiresAction ? "ready" : "no_action";

  const snapshot = {
    verifiedPayments: rows.length,
    outstandingRent: roundMoney(state.rentOutstanding),
    outstandingUtilities: roundMoney(state.utilitiesOutstanding),
    eligibleDeposit: roundMoney(state.depositOutstanding),
    expectedWalletBalance,
    currentWalletBalance,
  };
  const previewHash = makeReconciliationPreviewHash({
    tenantId,
    propertyId: tenant.propertyId || null,
    tenantUpdatedAt: tenant.updatedAt || null,
    propertyUpdatedAt: property?.updatedAt || null,
    payments: allPayments.map((payment: any) => ({
      id: String(payment._id), status: payment.status || null, amount: payment.amount ?? null,
      postedAmount: payment.postedAmount ?? null, postingStatus: payment.financialPostingStatus || null,
      updatedAt: payment.updatedAt || null, allocation: payment.allocation || null,
      providerTransactionId: payment.providerTransactionId || null, mpesaCode: payment.mpesaCode || null,
    })),
    walletEntries: walletEntries.map((entry: any) => ({ eventKey: entry.eventKey, kind: entry.kind, direction: entry.direction, amount: entry.amount, sourcePaymentId: entry.sourcePaymentId ? String(entry.sourcePaymentId) : null })),
    postedLedgerRows: postedLedgerRows.map((event: any) => ({
      eventKey: event.eventKey || null, sourcePaymentId: String(event.sourcePaymentId), amount: event.amount,
      providerReference: event.providerReference || null,
    })),
    utilityCharges: utilityCharges.map((charge: any) => ({
      id: String(charge._id), billingPeriod: charge.billingPeriod || null, amount: charge.amount,
      status: charge.status || null, updatedAt: charge.updatedAt || null,
    })),
    snapshot,
    proposals,
    issues: [...issueSet].sort(),
  });

  return {
    tenantId,
    landlordId: property?.ownerId ? String(property.ownerId) : params.landlordId || null,
    propertyId: tenant.propertyId ? String(tenant.propertyId) : null,
    tenantName: String(tenant.name || tenant.fullName || "Unknown tenant"),
    propertyName: String(property?.name || property?.propertyName || "Unknown property"),
    unit: unitForTenant(tenant),
    currentWalletBalance,
    expectedWalletBalance,
    existingWalletCredits,
    existingWalletDebits,
    verifiedPaymentAmount,
    totalPaymentAllocationAmount,
    outstandingRent: roundMoney(state.rentOutstanding),
    outstandingUtilities: roundMoney(state.utilitiesOutstanding),
    eligibleDeposit: roundMoney(state.depositOutstanding),
    otherEligibleCharges: 0,
    eligibleOutstanding: roundMoney(state.rentOutstanding + state.utilitiesOutstanding + state.depositOutstanding),
    potentiallyMisallocatedAmount,
    walletAmountToAllocate,
    verifiedPaymentCount: rows.length,
    unallocatedVerifiedPaymentCount,
    pendingPaymentCount,
    reversedOrRefundedPaymentCount,
    duplicatePaymentCount,
    allocationMismatchCount,
    walletBalanceMismatch,
    issues: [...issueSet].sort(),
    proposals,
    status,
    previewHash,
    snapshot,
    blockingIssues: [...blockingIssues].sort(),
    matchingPaymentCount,
  };
}

export type ExecuteTenantReconciliationResult = {
  reconciliationId: string;
  idempotencyKey: string;
  tenantId: string;
  status: "succeeded" | "no_action" | "failed";
  before: Record<string, number>;
  after: Record<string, number>;
  proposals: ReconciliationAllocationProposal[];
  paymentReferences: string[];
  actorId: string;
  actorRole: string;
  executedAt: string;
  failureReason?: string;
};

function isIneligibleInvoiceStatus(status: unknown) {
  return ["cancelled", "canceled", "void", "deleted", "draft"].includes(String(status || "").toLowerCase());
}

export async function ensurePaymentReconciliationIndexes(db: Db) {
  await db.collection("paymentReconciliations").createIndexes([
    { key: { idempotencyKey: 1 }, name: "paymentReconciliations_idempotency_unique", unique: true },
    { key: { tenantId: 1, createdAt: -1 }, name: "paymentReconciliations_tenant_created" },
    { key: { landlordId: 1, createdAt: -1 }, name: "paymentReconciliations_landlord_created" },
    { key: { reconciliationId: 1 }, name: "paymentReconciliations_id_unique", unique: true },
  ]);
}

export async function executeTenantPaymentReconciliation(params: {
  db: Db;
  client: MongoClient;
  tenantId: string;
  landlordId?: string | null;
  expectedPreviewHash: string;
  idempotencyKey: string;
  actorId: string;
  actorRole: string;
}): Promise<ExecuteTenantReconciliationResult> {
  if (!ObjectId.isValid(params.tenantId)) throw new Error("Invalid tenant ID");
  if (!/^[A-Za-z0-9:_-]{12,160}$/.test(params.idempotencyKey)) throw new Error("Invalid reconciliation idempotency key");
  if (!/^[a-f0-9]{64}$/.test(params.expectedPreviewHash)) throw new Error("Invalid preview token");

  await ensurePaymentReconciliationIndexes(params.db);
  const previous = await params.db.collection("paymentReconciliations").findOne({ idempotencyKey: params.idempotencyKey });
  if (previous) {
    if (String(previous.tenantId) !== params.tenantId) throw new Error("Idempotency key is already associated with another reconciliation");
    return previous as unknown as ExecuteTenantReconciliationResult;
  }

  const session = params.client.startSession();
  const reconciliationId = randomUUID();
  const executedAt = new Date().toISOString();
  let committedResult: ExecuteTenantReconciliationResult | null = null;
  let attemptedAnalysis: TenantPaymentReconciliationAnalysis | null = null;
  let attemptedProperty: any = null;
  try {
    await session.withTransaction(async () => {
      const staleLockBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const tenantClaim = await params.db.collection("tenants").findOneAndUpdate(
        {
          _id: new ObjectId(params.tenantId),
          $or: [
            { financialAllocationLockAt: { $exists: false } },
            { financialAllocationLockAt: null },
            { financialAllocationLockAt: { $lt: staleLockBefore } },
          ],
        },
        { $set: { financialAllocationLock: reconciliationId, financialAllocationLockAt: new Date().toISOString() } },
        { session, returnDocument: "after" },
      );
      const tenant = (tenantClaim as any)?.value ?? tenantClaim;
      if (!tenant) {
        const exists = await params.db.collection("tenants").findOne({ _id: new ObjectId(params.tenantId) }, { session, projection: { _id: 1 } });
        if (!exists) throw new Error("Tenant not found");
        throw new Error("Tenant financial records are being updated. Retry reconciliation shortly.");
      }
      const propertyId = String(tenant.propertyId || "");
      const property = propertyId && ObjectId.isValid(propertyId)
        ? await params.db.collection("properties").findOne({ _id: new ObjectId(propertyId) }, { session })
        : null;
      if (!property || params.landlordId && String(property.ownerId) !== params.landlordId) throw new Error("Tenant property is outside your financial scope");

      const current = await analyzeTenantPaymentReconciliation({
        db: params.db, tenant, property, landlordId: params.landlordId, session,
      });
      attemptedAnalysis = current;
      attemptedProperty = property;
      if (current.previewHash !== params.expectedPreviewHash) {
        const error = new Error("Financial records changed after the preview. Refresh the preview before confirming.");
        (error as any).code = "PREVIEW_STALE";
        throw error;
      }
      if (current.blockingIssues.length) {
        const error = new Error(`This tenant requires review: ${current.blockingIssues.join(", ")}`);
        (error as any).code = "REQUIRES_REVIEW";
        throw error;
      }

      const before = {
        walletBalance: current.currentWalletBalance,
        rentOutstanding: current.outstandingRent,
        utilityOutstanding: current.outstandingUtilities,
        depositOutstanding: current.eligibleDeposit,
      };
      let reconciliation: any = null;
      let status: "succeeded" | "no_action" = "succeeded";
      if (current.status === "ready") {
        reconciliation = await reconcileTenantPaymentAllocation(params.db, params.tenantId, { session, lockToken: reconciliationId });
        if (!reconciliation) throw new Error("Tenant allocation recalculation failed");

        // Reconcile only active invoice projections linked to this tenant's
        // payments. Cancelled/void invoices are preserved as-is.
        const linkedPayments = await params.db.collection("payments")
          .find({ tenantId: { $in: identityValues(tenant._id) }, invoiceId: { $exists: true, $ne: null } }, { session })
          .project({ invoiceId: 1 })
          .toArray();
        const linkedInvoiceIds = [...new Set(linkedPayments.map((payment: any) => String(payment.invoiceId)).filter((id) => ObjectId.isValid(id)))];
        for (const invoiceId of linkedInvoiceIds) {
          const invoice = await params.db.collection("invoices").findOne({ _id: new ObjectId(invoiceId) }, { session, projection: { status: 1 } });
          if (invoice && !isIneligibleInvoiceStatus(invoice.status)) await reconcileInvoiceFinancialState(params.db, invoiceId, session);
        }
      } else {
        status = "no_action";
      }

      const afterTenant = await params.db.collection("tenants").findOne({ _id: tenant._id }, { session });
      const afterAnalysis = afterTenant
        ? await analyzeTenantPaymentReconciliation({ db: params.db, tenant: afterTenant, property, landlordId: params.landlordId, session })
        : null;
      if (!afterAnalysis) throw new Error("Unable to verify tenant balances after reconciliation");
      if (afterAnalysis.walletBalanceMismatch || afterAnalysis.status === "requires_review" || afterAnalysis.status === "ready") {
        throw new Error("Reconciliation verification found a remaining financial inconsistency");
      }

      const result: ExecuteTenantReconciliationResult = {
        reconciliationId,
        idempotencyKey: params.idempotencyKey,
        tenantId: params.tenantId,
        status,
        before,
        after: {
          walletBalance: afterAnalysis.expectedWalletBalance,
          rentOutstanding: afterAnalysis.outstandingRent,
          utilityOutstanding: afterAnalysis.outstandingUtilities,
          depositOutstanding: afterAnalysis.eligibleDeposit,
        },
        proposals: current.proposals,
        paymentReferences: [...new Set(current.proposals.map((proposal) => proposal.reference).filter((value): value is string => Boolean(value)))],
        actorId: params.actorId,
        actorRole: params.actorRole,
        executedAt,
      };
      await params.db.collection("paymentReconciliations").insertOne({
        ...result,
        landlordId: property.ownerId ? String(property.ownerId) : null,
        propertyId,
        tenantName: current.tenantName,
        propertyName: current.propertyName,
        unit: current.unit,
        issues: current.issues,
        allocationPolicyVersion: "deposit-first-v1",
        createdAt: executedAt,
      }, { session });
      await params.db.collection("tenants").updateOne(
        { _id: tenant._id, financialAllocationLock: reconciliationId },
        { $unset: { financialAllocationLock: "", financialAllocationLockAt: "" } },
        { session },
      );
      committedResult = result;
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" } });

    if (!committedResult) throw new Error("Reconciliation transaction did not commit");
    return committedResult;
  } catch (error) {
    const code = (error as any)?.code;
    if (code === "PREVIEW_STALE" || code === "REQUIRES_REVIEW") throw error;

    // A failed audit row is intentionally outside the aborted transaction;
    // it records the attempt while financial updates remain rolled back.
    const failureReason = error instanceof Error ? error.message : "Reconciliation transaction failed";
    const failureAnalysis = attemptedAnalysis as TenantPaymentReconciliationAnalysis | null;
    try {
      const tenant = await params.db.collection("tenants").findOne({ _id: new ObjectId(params.tenantId) });
      const paymentReferences = (failureAnalysis?.proposals || []).flatMap((proposal) => proposal.reference ? [proposal.reference] : []);
      const failure: ExecuteTenantReconciliationResult & Record<string, unknown> = {
        reconciliationId,
        idempotencyKey: params.idempotencyKey,
        tenantId: params.tenantId,
        status: "failed",
        before: failureAnalysis ? {
          walletBalance: failureAnalysis.currentWalletBalance,
          rentOutstanding: failureAnalysis.outstandingRent,
          utilityOutstanding: failureAnalysis.outstandingUtilities,
          depositOutstanding: failureAnalysis.eligibleDeposit,
        } : {},
        after: failureAnalysis ? {
          walletBalance: failureAnalysis.currentWalletBalance,
          rentOutstanding: failureAnalysis.outstandingRent,
          utilityOutstanding: failureAnalysis.outstandingUtilities,
          depositOutstanding: failureAnalysis.eligibleDeposit,
        } : {},
        proposals: failureAnalysis?.proposals || [],
        paymentReferences: [...new Set(paymentReferences)],
        actorId: params.actorId,
        actorRole: params.actorRole,
        executedAt,
        failureReason,
        landlordId: attemptedProperty?.ownerId ? String(attemptedProperty.ownerId) : params.landlordId || null,
        propertyId: tenant?.propertyId ? String(tenant.propertyId) : null,
        tenantName: tenant?.name || "Unknown tenant",
        propertyName: attemptedProperty?.name || attemptedProperty?.propertyName || null,
        unit: failureAnalysis?.unit || null,
        issues: failureAnalysis?.issues || [],
        allocationPolicyVersion: "deposit-first-v1",
        createdAt: executedAt,
      };
      await params.db.collection("paymentReconciliations").insertOne(failure);
      return failure;
    } catch {
      const existing = await params.db.collection("paymentReconciliations").findOne({ idempotencyKey: params.idempotencyKey });
      if (existing) return existing as unknown as ExecuteTenantReconciliationResult;
      throw new Error(`Reconciliation rolled back: ${failureReason}`);
    }
  } finally {
    await session.endSession();
  }
}
