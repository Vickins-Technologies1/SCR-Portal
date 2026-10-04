import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
const databaseName = process.env.MONGODB_DB || "rentaldb";
if (!uri) throw new Error("Set MONGODB_URI (or MONGO_URI) before running this read-only audit.");

const client = new MongoClient(uri);
await client.connect();
try {
  const db = client.db(databaseName);
  const payments = await db.collection("payments").find({ status: "completed" }, {
    projection: { amount: 1, type: 1, allocation: 1 },
  }).toArray();
  const findings = [];
  for (const payment of payments) {
    const allocation = payment.allocation;
    if (!allocation) {
      findings.push({ id: String(payment._id), code: "MISSING_ALLOCATION", type: payment.type || null });
      continue;
    }
    const allocated = ["deposit", "rent", "utilities", "other"].reduce((sum, key) => sum + Number(allocation[key] || 0), 0);
    const total = allocated + Number(allocation.walletCredit || 0) - Number(allocation.walletApplied || 0);
    if (Math.round((total - Number(payment.amount || 0)) * 100) / 100 !== 0) {
      findings.push({ id: String(payment._id), code: "ALLOCATION_SUM_MISMATCH", amount: payment.amount, allocated: total });
    }
    const expected = { Rent: "rent", Utility: "utilities", Deposit: "deposit", Other: "other" }[payment.type];
    if (expected && ["deposit", "rent", "utilities", "other"].some((key) => key !== expected && Number(allocation[key] || 0) > 0)) {
      findings.push({ id: String(payment._id), code: "EXPLICIT_CATEGORY_MISMATCH", type: payment.type, allocation });
    }
  }
  const byCode = Object.fromEntries([...new Set(findings.map((finding) => finding.code))].map((code) => [
    code,
    findings.filter((finding) => finding.code === code).length,
  ]));
  console.log(JSON.stringify({
    scannedPayments: payments.length,
    suspiciousRecords: findings.length,
    byCode,
    sample: findings.slice(0, 20),
  }, null, 2));
} finally {
  await client.close();
}
