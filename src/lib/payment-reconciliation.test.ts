import { beforeEach, describe, expect, it, vi } from "vitest";
import { ObjectId } from "mongodb";
import { analyzeTenantPaymentReconciliation, executeTenantPaymentReconciliation } from "./payment-reconciliation";
import { calculateTenantFinancialState, reconcileTenantPaymentAllocation } from "./tenant-payment-allocation";
import { getFinancialPaymentRows } from "./financial-reporting";

vi.mock("./tenant-payment-allocation", () => ({
  calculateTenantFinancialState: vi.fn(),
  reconcileTenantPaymentAllocation: vi.fn(),
}));
vi.mock("./financial-reporting", () => ({
  getFinancialPaymentRows: vi.fn(),
  reconcileInvoiceFinancialState: vi.fn(async () => null),
}));

const tenantId = new ObjectId("670000000000000000000001");
const propertyId = new ObjectId("670000000000000000000002");
const paymentId = new ObjectId("670000000000000000000003");
const tenant = { _id: tenantId, name: "Amina Otieno", propertyId: propertyId.toString(), walletBalance: 0, updatedAt: "2026-11-01T00:00:00.000Z" };
const property = { _id: propertyId, ownerId: "670000000000000000000004", name: "Green Court", updatedAt: "2026-11-01T00:00:00.000Z" };

function state(overrides: Record<string, unknown> = {}) {
  return {
    rentPaid: 0,
    rentOutstanding: 0,
    utilitiesPaid: 0,
    utilitiesOutstanding: 0,
    depositPaid: 0,
    depositOutstanding: 0,
    walletBalance: 0,
    walletApplied: 0,
    paymentAllocations: new Map(),
    ...overrides,
  } as any;
}

function cursor(rows: any[]) {
  return {
    sort: () => cursor(rows),
    limit: () => cursor(rows),
    project: () => cursor(rows),
    toArray: async () => rows,
  };
}

function makeDb(params: { payments?: any[]; duplicates?: any[]; walletEntries?: any[]; invoices?: any[]; tenantDoc?: any } = {}) {
  const inserted: any[] = [];
  const db = {
    collection(name: string) {
      if (name === "payments") return {
        find: (filter: any) => cursor(filter?.$or ? (params.duplicates || []) : (params.payments || [])),
        findOne: async () => params.payments?.[0] || null,
      };
      if (name === "utilityCharges") return { find: () => cursor([]) };
      if (name === "walletTransactions") return { find: () => cursor(params.walletEntries || []) };
      if (name === "invoices") return { find: () => cursor(params.invoices || []) };
      if (name === "tenants") return {
        findOne: async () => params.tenantDoc || tenant,
        findOneAndUpdate: async () => params.tenantDoc || tenant,
        updateOne: async () => ({ matchedCount: 1, modifiedCount: 1 }),
      };
      if (name === "properties") return { findOne: async () => property };
      if (name === "paymentReconciliations") return {
        createIndexes: async () => [],
        findOne: async () => null,
        insertOne: async (value: any) => { inserted.push(value); return { insertedId: new ObjectId() }; },
      };
      if (name === "financialLedger") return {
        aggregate: () => cursor([]),
        find: () => cursor((params.payments || []).filter((payment: any) => payment.financialPostingStatus === "posted").map((payment: any) => ({
          sourcePaymentId: payment._id,
          amount: payment.postedAmount ?? payment.amount,
          eventKey: `payment:${payment._id}:posted`,
          providerReference: payment.mpesaCode || null,
        }))),
      };
      throw new Error(`Unexpected collection ${name}`);
    },
  } as any;
  return { db, inserted };
}

function payment(overrides: Record<string, unknown> = {}) {
  return {
    _id: paymentId,
    tenantId,
    propertyId,
    provider: "daraja",
    status: "completed",
    financialPostingStatus: "posted",
    amount: 10_000,
    postedAmount: 10_000,
    allocation: { deposit: 0, rent: 0, utilities: 0, other: 0, walletCredit: 10_000 },
    mpesaCode: "QRS123456",
    ...overrides,
  };
}

function row(paymentDoc: any, allocation: any = paymentDoc.allocation) {
  return {
    payment: paymentDoc,
    eventDate: new Date("2026-10-20T00:00:00.000Z"),
    originalAmount: Number(paymentDoc.amount),
    reversedAmount: 0,
    netAmount: Number(paymentDoc.postedAmount ?? paymentDoc.amount),
    allocation,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(calculateTenantFinancialState).mockResolvedValue(state());
  vi.mocked(reconcileTenantPaymentAllocation).mockResolvedValue({ walletBalance: 0 } as any);
  vi.mocked(getFinancialPaymentRows).mockResolvedValue([]);
});

describe("payment reconciliation analysis", () => {
  it("finds wallet credit against outstanding rent and links the debit to the source payment", async () => {
    const source = payment();
    const calculated = {
      deposit: 0, rent: 0, utilities: 0, other: 0, walletCredit: 10_000,
      walletApplied: 10_000, walletAllocation: { deposit: 0, rent: 10_000, utilities: 0, other: 0 },
    };
    vi.mocked(calculateTenantFinancialState).mockResolvedValue(state({
      rentOutstanding: 5_000, rentPaid: 10_000, walletBalance: 0, walletApplied: 10_000,
      paymentAllocations: new Map([[paymentId.toString(), calculated]]),
    }));
    vi.mocked(getFinancialPaymentRows).mockResolvedValue([row(source)] as any);
    const { db } = makeDb({ payments: [source] });

    const result = await analyzeTenantPaymentReconciliation({ db, tenant: { ...tenant, walletBalance: 10_000 }, property, landlordId: String(property.ownerId) });

    expect(result.status).toBe("ready");
    expect(result.outstandingRent).toBe(5_000);
    expect(result.expectedWalletBalance).toBe(0);
    expect(result.walletAmountToAllocate).toBe(10_000);
    expect(result.proposals[0]).toMatchObject({ paymentId: paymentId.toString(), reference: "QRS123456", walletDebitToPost: 10_000, walletAllocation: { rent: 10_000 } });
  });

  it("keeps verified excess in the wallet after the eligible rent is covered", async () => {
    const source = payment({ allocation: undefined, allocationPolicyVersion: "deposit-first-v1", amount: 20_000, postedAmount: 20_000 });
    const calculated = { deposit: 0, rent: 15_000, utilities: 0, other: 0, walletCredit: 5_000, walletApplied: 0 };
    vi.mocked(calculateTenantFinancialState).mockResolvedValue(state({
      rentPaid: 15_000, rentOutstanding: 0, walletBalance: 5_000,
      paymentAllocations: new Map([[paymentId.toString(), calculated]]),
    }));
    vi.mocked(getFinancialPaymentRows).mockResolvedValue([row(source, { deposit: 0, rent: 0, utilities: 0, other: 0, walletCredit: 20_000 })] as any);
    const { db } = makeDb({ payments: [source] });

    const result = await analyzeTenantPaymentReconciliation({ db, tenant: { ...tenant, walletBalance: 20_000 }, property, landlordId: String(property.ownerId) });

    expect(result.status).toBe("ready");
    expect(result.expectedWalletBalance).toBe(5_000);
    expect(result.outstandingRent).toBe(0);
    expect(result.proposals[0].proposedAllocation).toMatchObject({ rent: 15_000, walletCredit: 5_000 });
  });

  it("reports pending and reversed records without treating them as available money", async () => {
    const { db } = makeDb({ payments: [
      payment({ status: "pending_stk", financialPostingStatus: "pending", amount: 12_000 }),
      payment({ _id: new ObjectId(), status: "reversed", amount: 8_000, allocation: null }),
    ] });

    const result = await analyzeTenantPaymentReconciliation({ db, tenant, property, landlordId: String(property.ownerId) });

    expect(result.verifiedPaymentCount).toBe(0);
    expect(result.pendingPaymentCount).toBe(1);
    expect(result.reversedOrRefundedPaymentCount).toBe(1);
    expect(result.expectedWalletBalance).toBe(0);
  });

  it("blocks duplicate provider references and mismatched historical wallet debits", async () => {
    const source = payment();
    const calculated = { deposit: 0, rent: 0, utilities: 0, other: 0, walletCredit: 10_000, walletApplied: 10_000 };
    vi.mocked(calculateTenantFinancialState).mockResolvedValue(state({
      rentOutstanding: 1_000, walletApplied: 10_000, paymentAllocations: new Map([[paymentId.toString(), calculated]]),
    }));
    vi.mocked(getFinancialPaymentRows).mockResolvedValue([row(source)] as any);
    const { db } = makeDb({
      payments: [source],
      duplicates: [{ _id: new ObjectId(), provider: "daraja", mpesaCode: "QRS123456" }],
      walletEntries: [{ eventKey: "legacy-debit", kind: "CREDIT_CONSUMED", direction: "DEBIT", amount: 9_000, tenantId, sourcePaymentId: paymentId }],
    });

    const result = await analyzeTenantPaymentReconciliation({ db, tenant: { ...tenant, walletBalance: 10_000 }, property, landlordId: String(property.ownerId) });

    expect(result.status).toBe("requires_review");
    expect(result.blockingIssues).toContain("DUPLICATE_PROVIDER_REFERENCE");
    expect(result.blockingIssues).toContain("EXISTING_WALLET_DEBIT_DIFFERS_FROM_CURRENT_ALLOCATION");
  });

  it("blocks duplicate provider references within the same tenant", async () => {
    const first = payment();
    const second = payment({ _id: new ObjectId(), transactionId: "QRS123456" });
    const allocation = { deposit: 0, rent: 0, utilities: 0, other: 0, walletCredit: 10_000, walletApplied: 0 };
    vi.mocked(calculateTenantFinancialState).mockResolvedValue(state({
      walletBalance: 20_000,
      paymentAllocations: new Map([[String(first._id), allocation], [String(second._id), allocation]]),
    }));
    vi.mocked(getFinancialPaymentRows).mockResolvedValue([row(first), row(second)] as any);
    const { db } = makeDb({ payments: [first, second] });

    const result = await analyzeTenantPaymentReconciliation({ db, tenant: { ...tenant, walletBalance: 20_000 }, property });

    expect(result.status).toBe("requires_review");
    expect(result.duplicatePaymentCount).toBe(2);
    expect(result.blockingIssues).toContain("DUPLICATE_PROVIDER_REFERENCE");
  });

  it("requires review when the recorded wallet is below its payment ledger balance", async () => {
    vi.mocked(calculateTenantFinancialState).mockResolvedValue(state({ walletBalance: 5_000 }));
    const { db } = makeDb();

    const result = await analyzeTenantPaymentReconciliation({
      db, tenant: { ...tenant, walletBalance: 3_000 }, property, landlordId: String(property.ownerId),
    });

    expect(result.status).toBe("requires_review");
    expect(result.blockingIssues).toContain("WALLET_BALANCE_BELOW_EXPECTED_LEDGER");
  });

  it("flags cancelled invoices but does not make their amount eligible for allocation", async () => {
    const source: any = payment({ invoiceId: "670000000000000000000005" });
    const { db } = makeDb({ payments: [source], invoices: [{ _id: new ObjectId(source.invoiceId), status: "cancelled" }] });
    vi.mocked(calculateTenantFinancialState).mockResolvedValue(state({
      paymentAllocations: new Map([[paymentId.toString(), { deposit: 0, rent: 0, utilities: 0, other: 0, walletCredit: 10_000, walletApplied: 0 }]]),
    }));
    vi.mocked(getFinancialPaymentRows).mockResolvedValue([row(source)] as any);

    const result = await analyzeTenantPaymentReconciliation({ db, tenant, property, landlordId: String(property.ownerId) });

    expect(result.issues).toContain("INELIGIBLE_INVOICE_NOT_UPDATED");
  });
});

describe("payment reconciliation execution safeguards", () => {
  it("returns a prior idempotent result without opening a transaction", async () => {
    const previous = { reconciliationId: "existing", tenantId: tenantId.toString(), status: "succeeded" };
    const db = {
      collection: () => ({ createIndexes: async () => [], findOne: async () => previous }),
    } as any;
    const startSession = vi.fn();

    const result = await executeTenantPaymentReconciliation({
      db, client: { startSession } as any, tenantId: tenantId.toString(), expectedPreviewHash: "a".repeat(64),
      idempotencyKey: "retry-key-0001", actorId: "actor", actorRole: "propertyOwner",
    });

    expect(result).toBe(previous);
    expect(startSession).not.toHaveBeenCalled();
  });

  it("records a failed attempt after a transactional allocation error", async () => {
    const source = payment();
    vi.mocked(calculateTenantFinancialState).mockResolvedValue(state({
      rentOutstanding: 5_000, walletApplied: 10_000,
      paymentAllocations: new Map([[paymentId.toString(), { deposit: 0, rent: 0, utilities: 0, other: 0, walletCredit: 10_000, walletApplied: 0 }]]),
    }));
    vi.mocked(getFinancialPaymentRows).mockResolvedValue([row(source)] as any);
    vi.mocked(reconcileTenantPaymentAllocation).mockRejectedValue(new Error("simulated write failure"));
    const tenantWithWallet = { ...tenant, walletBalance: 10_000 };
    const { db, inserted } = makeDb({ payments: [source], tenantDoc: tenantWithWallet });
    const session = { withTransaction: async (callback: () => Promise<void>) => callback(), endSession: async () => undefined };

    const result = await executeTenantPaymentReconciliation({
      db,
      client: { startSession: () => session } as any,
      tenantId: tenantId.toString(),
      landlordId: String(property.ownerId),
      expectedPreviewHash: (await analyzeTenantPaymentReconciliation({ db, tenant: tenantWithWallet, property, landlordId: String(property.ownerId) })).previewHash,
      idempotencyKey: "failed-run-0001",
      actorId: "actor",
      actorRole: "propertyOwner",
    });

    expect(result.status).toBe("failed");
    expect(result.failureReason).toContain("simulated write failure");
    expect(inserted).toHaveLength(1);
  });

  it("fails verification when recalculation leaves a ready proposal", async () => {
    const source = payment();
    const tenantWithWallet = { ...tenant, walletBalance: 10_000 };
    vi.mocked(calculateTenantFinancialState).mockResolvedValue(state({
      rentOutstanding: 5_000, walletApplied: 10_000,
      paymentAllocations: new Map([[paymentId.toString(), {
        deposit: 0, rent: 0, utilities: 0, other: 0, walletCredit: 10_000, walletApplied: 10_000,
      }]]),
    }));
    vi.mocked(getFinancialPaymentRows).mockResolvedValue([row(source)] as any);
    const { db, inserted } = makeDb({ payments: [source], tenantDoc: tenantWithWallet });
    const session = { withTransaction: async (callback: () => Promise<void>) => callback(), endSession: async () => undefined };
    const previewHash = (await analyzeTenantPaymentReconciliation({
      db, tenant: tenantWithWallet, property, landlordId: String(property.ownerId),
    })).previewHash;

    const result = await executeTenantPaymentReconciliation({
      db,
      client: { startSession: () => session } as any,
      tenantId: tenantId.toString(),
      landlordId: String(property.ownerId),
      expectedPreviewHash: previewHash,
      idempotencyKey: "verify-run-0001",
      actorId: "actor",
      actorRole: "propertyOwner",
    });

    expect(reconcileTenantPaymentAllocation).toHaveBeenCalledWith(db, tenantId.toString(), {
      session,
      lockToken: expect.any(String),
    });
    expect(result.status).toBe("failed");
    expect(result.failureReason).toContain("remaining financial inconsistency");
    expect(inserted[0].status).toBe("failed");
  });
});
