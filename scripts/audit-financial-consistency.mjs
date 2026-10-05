import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const databaseName = process.env.MONGODB_DB || "rentaldb";

if (!uri) {
  console.error("LIVE DATABASE RECONCILIATION NOT RUN: set MONGODB_URI (or MONGO_URI) for a read-only audit.");
  process.exitCode = 2;
} else {
  const client = new MongoClient(uri, { readPreference: "secondaryPreferred" });
  await client.connect();
  try {
    const db = client.db(databaseName);
    const payments = await db.collection("payments").find({}).toArray();
    const postedPayments = payments.filter((p) => p.status === "completed" && p.financialPostingStatus !== "quarantined");
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

    const missingPostingStatus = payments.filter((p) => p.status === "completed" && !p.financialPostingStatus);
    const missingProviderIdentity = postedPayments.filter((p) => !p.providerTransactionId && !p.transactionId && !p.reference);
    const missingAllocation = postedPayments.filter((p) => !p.allocation && !postedLedger.some((e) => String(e.sourcePaymentId) === String(p._id)));
    const allocationMismatches = postedPayments.flatMap((p) => {
      const a = p.allocation || {};
      const allocated = ["rent", "utilities", "deposit", "other", "walletCredit"].reduce((s, k) => s + Math.max(0, Number(a[k]) || 0), 0);
      const amount = Number(p.postedAmount ?? p.amount) || 0;
      return allocated > amount + 0.01 ? [{ paymentId: String(p._id), allocated, amount }] : [];
    });

    async function duplicates(field) {
      return db.collection("payments").aggregate([
        { $match: { status: "completed", [field]: { $type: "string", $ne: "" } } },
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
    const relationshipMismatches = postedPayments.filter((p) => {
      const tenant = p.tenantId ? tenants.find((t) => String(t._id) === String(p.tenantId)) : null;
      return tenant && p.propertyId && String(tenant.propertyId) !== String(p.propertyId);
    });
    const orphanUtilityAllocations = postedPayments.flatMap((p) => (p.utilityAllocations || []).filter((a) => !utilityById.has(String(a.utilityChargeId)) || !a.billingPeriod).map((allocation) => ({ paymentId: String(p._id), allocation })));
    const utilityAllocationMismatches = postedPayments.flatMap((p) => (p.utilityAllocations || []).flatMap((a) => {
      const charge = utilityById.get(String(a.utilityChargeId));
      const allocated = Number(a.amount || 0);
      const charged = Number(charge?.amount || charge?.totalAmount || 0);
      return charge && allocated > charged + 0.01 ? [{ paymentId: String(p._id), utilityChargeId: String(a.utilityChargeId), allocated, charged }] : [];
    }));

    const reversalTotals = new Map();
    for (const reversal of reversals) reversalTotals.set(String(reversal.sourcePaymentId), (reversalTotals.get(String(reversal.sourcePaymentId)) || 0) + Number(reversal.amount || 0));
    const excessReversals = [...reversalTotals.entries()].flatMap(([paymentId, total]) => {
      const payment = paymentById.get(paymentId);
      const original = Number(payment?.postedAmount ?? payment?.amount ?? 0);
      return total > original + 0.01 ? [{ paymentId, reversed: total, original }] : [];
    });

    const invoiceFindings = [];
    for (const invoice of invoices) {
      const related = postedPayments.filter((p) => String(p.invoiceId || "") === String(invoice._id));
      const paid = related.reduce((s, p) => s + Math.max(0, Number(p.postedAmount ?? p.amount) || 0), 0);
      const expectedBalance = Math.max(0, Number(invoice.amount || 0) - paid);
      if (invoice.balanceDue != null && Math.abs(Number(invoice.balanceDue) - expectedBalance) > 0.01) {
        invoiceFindings.push({ invoiceId: String(invoice._id), storedBalance: invoice.balanceDue, expectedBalance });
      }
    }

    const findings = {
      missingPostingStatus: missingPostingStatus.map((p) => String(p._id)),
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
      scanned: { payments: payments.length, postedPayments: postedPayments.length, financialLedger: ledger.length, walletTransactions: wallet.length, invoices: invoices.length, tenants: tenants.length, utilityCharges: utilityCharges.length },
      findings,
      categories: {
        CLEAN: [],
        REVIEW_REQUIRED: ["missingPostingStatus", "missingProviderIdentity", "missingAllocation"].filter((key) => findingsCount(key) > 0),
        DATA_INCONSISTENCY: ["allocationMismatches", "duplicateProviderTransactions", "duplicateReceipts", "orphanLedger", "orphanWalletTransactions", "duplicateLedgerEventKeys", "negativeWalletBalances", "orphanInvoiceReferences", "relationshipMismatches", "orphanUtilityAllocations", "utilityAllocationMismatches", "excessReversals", "invoiceFindings"].filter((key) => findingsCount(key) > 0),
        SYSTEM_ERROR: [],
      },
    }, null, 2));
  } finally {
    await client.close();
  }
}
