import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const databaseName = process.env.MONGODB_DB || "rentaldb";
const SUCCESSFUL_PAYMENT_STATUSES = ["completed", "successful", "success", "paid", "settled"];

const isSuccessfulPayment = (payment) => SUCCESSFUL_PAYMENT_STATUSES.includes(String(payment?.status || "").toLowerCase());
const hasPostingEvidence = (payment) =>
  payment?.postedAmount != null || payment?.providerConfirmedAmount != null || payment?.financialEffectsApplied === true;
const isFinanciallyEligible = (payment) =>
  payment?.financialPostingStatus == null ||
  ["posted", "processing"].includes(payment.financialPostingStatus) ||
  (payment.financialPostingStatus === "pending" && hasPostingEvidence(payment));
const roundCurrency = (value) => Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
const paymentAmount = (payment) => Math.max(0, roundCurrency(Number(payment?.postedAmount ?? payment?.providerConfirmedAmount ?? payment?.amount) || 0));
const invoiceTotal = (invoice) => {
  const items = Array.isArray(invoice?.items) ? invoice.items : [];
  const subtotal = roundCurrency(items.length
    ? items.reduce((sum, item) => sum + Math.max(0, Number(item?.qty) || 0) * Math.max(0, Number(item?.rate) || 0), 0)
    : Math.max(0, Number(invoice?.amount) || 0));
  const discount = roundCurrency(Math.max(0, Number(invoice?.discount) || 0));
  const tax = roundCurrency(Math.max(0, Number(invoice?.tax) || 0));
  return roundCurrency(Math.max(0, subtotal - discount + tax));
};

if (!uri) {
  console.error("LIVE DATABASE RECONCILIATION NOT RUN: set MONGODB_URI (or MONGO_URI) for a read-only audit.");
  process.exitCode = 2;
} else {
  const client = new MongoClient(uri, { readPreference: "secondaryPreferred" });
  await client.connect();
  try {
    const db = client.db(databaseName);
    const payments = await db.collection("payments").find({}).toArray();
    const successfulPayments = payments.filter(isSuccessfulPayment);
    const eligiblePayments = successfulPayments.filter(isFinanciallyEligible);
    const incompletePosting = successfulPayments
      .filter((p) => ["processing", "pending", "quarantined"].includes(p.financialPostingStatus))
      .map((p) => ({ paymentId: String(p._id), financialPostingStatus: p.financialPostingStatus }));
    const ledger = await db.collection("financialLedger").find({}).toArray();
    const wallet = await db.collection("walletTransactions").find({}).toArray();
    const invoices = await db.collection("invoices").find({}).toArray();
    const tenants = await db.collection("tenants").find({}).toArray();
    const utilityCharges = await db.collection("utilityCharges").find({ status: "posted" }).toArray();

    const paymentById = new Map(payments.map((p) => [String(p._id), p]));
    const invoiceById = new Map(invoices.map((p) => [String(p._id), p]));
    const utilityById = new Map(utilityCharges.map((p) => [String(p._id), p]));
    const postedLedger = ledger.filter((e) => e.kind === "PAYMENT_POSTED" && e.status !== "rejected");
    const reversals = ledger.filter((e) => e.kind === "PAYMENT_REVERSED" && e.status === "posted");

    const missingPostingStatus = payments.filter((p) => isSuccessfulPayment(p) && !p.financialPostingStatus);
    const missingProviderIdentity = eligiblePayments.filter((p) => !p.providerTransactionId && !p.transactionId && !p.reference);
    const missingAllocation = eligiblePayments.filter((p) => !p.allocation && !postedLedger.some((e) => String(e.sourcePaymentId) === String(p._id)));
    const allocationMismatches = eligiblePayments.flatMap((p) => {
      const a = p.allocation || {};
      const allocated = ["rent", "utilities", "deposit", "other", "walletCredit"].reduce((s, k) => s + Math.max(0, Number(a[k]) || 0), 0);
      const amount = paymentAmount(p);
      return allocated > amount + 0.01 ? [{ paymentId: String(p._id), allocated, amount }] : [];
    });

    async function duplicates(field) {
      return db.collection("payments").aggregate([
        {
          $match: {
            status: { $in: SUCCESSFUL_PAYMENT_STATUSES },
            $or: [
              { financialPostingStatus: { $in: ["posted", "processing", null] } },
              { financialPostingStatus: { $exists: false } },
              {
                financialPostingStatus: "pending",
                $or: [
                  { postedAmount: { $exists: true, $ne: null } },
                  { providerConfirmedAmount: { $exists: true, $ne: null } },
                  { financialEffectsApplied: true },
                ],
              },
            ],
            [field]: { $exists: true, $nin: [null, ""] },
          },
        },
        { $group: { _id: "$" + field, ids: { $push: "$_id" }, count: { $sum: 1 } } },
        { $match: { count: { $gt: 1 } } },
      ]).toArray();
    }
    const [duplicateProviderTransactions, duplicateReceipts] = await Promise.all([duplicates("providerTransactionId"), duplicates("mpesaCode")]);

    const orphanLedger = ledger.filter((e) => e.sourcePaymentId && !paymentById.has(String(e.sourcePaymentId)));
    const orphanWalletTransactions = wallet.filter((e) => e.sourcePaymentId && !paymentById.has(String(e.sourcePaymentId)));
    const duplicateLedgerEventKeys = [...ledger.reduce((map, event) => {
      const key = String(event.eventKey || "");
      if (key) map.set(key, [...(map.get(key) || []), String(event._id)]);
      return map;
    }, new Map()).entries()].filter(([, ids]) => ids.length > 1).map(([eventKey, ids]) => ({ eventKey, ids }));
    const walletBalances = [...wallet.reduce((map, event) => {
      const tenantId = String(event.tenantId || "");
      if (!tenantId) return map;
      const signed = event.direction === "DEBIT" ? -Number(event.amount || 0) : Number(event.amount || 0);
      map.set(tenantId, (map.get(tenantId) || 0) + signed);
      return map;
    }, new Map()).entries()].filter(([, balance]) => balance < -0.01).map(([tenantId, balance]) => ({ tenantId, balance }));
    const orphanInvoiceReferences = payments.filter((p) => p.invoiceId && !invoiceById.has(String(p.invoiceId)));
    const relationshipMismatches = eligiblePayments.filter((p) => {
      const tenant = p.tenantId ? tenants.find((t) => String(t._id) === String(p.tenantId)) : null;
      return tenant && p.propertyId && String(tenant.propertyId) !== String(p.propertyId);
    });
    const orphanUtilityAllocations = eligiblePayments.flatMap((p) => (p.utilityAllocations || []).filter((a) => !utilityById.has(String(a.utilityChargeId)) || !a.billingPeriod).map((allocation) => ({ paymentId: String(p._id), allocation })));
    const utilityAllocationMismatches = eligiblePayments.flatMap((p) => (p.utilityAllocations || []).flatMap((a) => {
      const charge = utilityById.get(String(a.utilityChargeId));
      const allocated = Number(a.amount || 0);
      const charged = Number(charge?.amount || charge?.totalAmount || 0);
      return charge && allocated > charged + 0.01 ? [{ paymentId: String(p._id), utilityChargeId: String(a.utilityChargeId), allocated, charged }] : [];
    }));

    const reversalTotals = new Map();
    for (const reversal of reversals) reversalTotals.set(String(reversal.sourcePaymentId), (reversalTotals.get(String(reversal.sourcePaymentId)) || 0) + Number(reversal.amount || 0));
    const excessReversals = [...reversalTotals.entries()].flatMap(([paymentId, total]) => {
      const payment = paymentById.get(paymentId);
      const original = paymentAmount(payment);
      return total > original + 0.01 ? [{ paymentId, reversed: total, original }] : [];
    });

    const invoiceFindings = [];
    for (const invoice of invoices) {
      const related = eligiblePayments.filter((p) => String(p.invoiceId || "") === String(invoice._id));
      const paid = related.reduce((s, p) => s + Math.max(0, paymentAmount(p) - (reversalTotals.get(String(p._id)) || 0)), 0);
      const expectedBalance = Math.max(0, invoiceTotal(invoice) - paid);
      if (invoice.balanceDue != null && Math.abs(Number(invoice.balanceDue) - expectedBalance) > 0.01) {
        invoiceFindings.push({ invoiceId: String(invoice._id), storedBalance: invoice.balanceDue, expectedBalance });
      }
    }

    const findings = {
      missingPostingStatus: missingPostingStatus.map((p) => String(p._id)),
      incompletePosting,
      missingProviderIdentity: missingProviderIdentity.map((p) => String(p._id)),
      missingAllocation: missingAllocation.map((p) => String(p._id)),
      allocationMismatches,
      duplicateProviderTransactions: duplicateProviderTransactions.map((r) => ({ key: r._id, ids: r.ids.map(String) })),
      duplicateReceipts: duplicateReceipts.map((r) => ({ key: r._id, ids: r.ids.map(String) })),
      orphanLedger: orphanLedger.map((e) => String(e._id)),
      orphanWalletTransactions: orphanWalletTransactions.map((e) => String(e._id)),
      duplicateLedgerEventKeys,
      negativeWalletBalances: walletBalances,
      orphanInvoiceReferences: orphanInvoiceReferences.map((p) => String(p._id)),
      relationshipMismatches: relationshipMismatches.map((p) => String(p._id)),
      orphanUtilityAllocations,
      utilityAllocationMismatches,
      excessReversals,
      invoiceFindings,
    };
    const findingsCount = (key) => findings[key]?.length || 0;
    console.log(JSON.stringify({
      readOnly: true,
      scanned: { payments: payments.length, successfulPayments: successfulPayments.length, eligiblePayments: eligiblePayments.length, financialLedger: ledger.length, walletTransactions: wallet.length, invoices: invoices.length, tenants: tenants.length, utilityCharges: utilityCharges.length },
      findings,
      categories: {
        CLEAN: [],
        REVIEW_REQUIRED: ["missingPostingStatus", "incompletePosting", "missingProviderIdentity", "missingAllocation"].filter((key) => findingsCount(key) > 0),
        DATA_INCONSISTENCY: ["allocationMismatches", "duplicateProviderTransactions", "duplicateReceipts", "orphanLedger", "orphanWalletTransactions", "duplicateLedgerEventKeys", "negativeWalletBalances", "orphanInvoiceReferences", "relationshipMismatches", "orphanUtilityAllocations", "utilityAllocationMismatches", "excessReversals", "invoiceFindings"].filter((key) => findingsCount(key) > 0),
        SYSTEM_ERROR: [],
      },
    }, null, 2));
  } finally {
    await client.close();
  }
}
