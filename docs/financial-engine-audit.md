# Financial engine audit

Audit date: 2026-10-13 (Africa/Nairobi)

Scope: source-level review of rent payment eligibility, tenant dues and allocation, invoice settlement, payment posting recovery, reversals, wallet projections, reporting consumers, and reconciliation tooling. No production database was queried or modified. The configured MongoDB deployment topology was not inspected, so transaction support is unverified.

## Financial model currently implemented

| Concept | Current authoritative input | Derived or cached values |
| --- | --- | --- |
| Eligible receipts | `payments` records with a recognized successful status, plus `postedAmount` / provider-confirmed amount precedence in `payment-query.ts` | Tenant totals, statements, report receipts, invoice settlement |
| Reversals | `financialLedger` rows where `kind=PAYMENT_REVERSED` and `status=posted`, linked by `sourcePaymentId` | Reversal-adjusted payment amounts and allocations |
| Tenant obligations | Lease dates, rent schedule/overrides, property utility configuration, posted `utilityCharges`, and required-deposit rules | Rent, utility, deposit and total outstanding in `TenantFinancialState` |
| Tenant payment allocation | Deterministic event-date order, declared category first, then the existing cascade through due categories | Per-payment `allocation`, tenant cached paid totals, wallet balance and payment status |
| Invoice total | Stored invoice amount/items, discount and tax under `calculateInvoiceTotals()` | `amountPaid`, `balanceDue`, `status` and `paidAt` |
| Wallet history | Idempotent `walletTransactions` events for payment credit, wallet consumption and reversal credit | Current tenant wallet balance is presently recalculated from payment allocations, rather than replayed from wallet events |
| Reports | `getFinancialPaymentRows()` and `getFinancialReportSummary()`; gross and net receipts are separate | Dashboard and export totals for metrics migrated to the shared reporting service |

Before the 2026-10-14 follow-up, the read-side payment filter admitted `processing` rows and some `pending` rows when amount/effects metadata existed. That risk is now addressed as described below.

## 2026-10-14 follow-up

The read-side eligibility boundary now admits successful payments only when posting is complete (`financialPostingStatus: "posted"`) or when the record predates posting markers (missing/null marker). `processing`, `pending`, and `quarantined` rows no longer contribute to financial totals solely because they carry a provider-confirmed amount. They remain discoverable by the reconciliation audit for review/retry. This avoids presenting a partially posted receipt as settled money; a durable scheduled recovery worker remains a separate operational gap.

The reconciliation audit's invoice expected balance now uses the application's item subtotal, discount, and tax rules before subtracting posted net payments. This removes the previous mismatch for itemized/discounted/taxed invoices. The script remains read-only and was not run against production; no live discrepancy counts are available.

## Findings and code paths

1. **Posting recovery could skip a wallet event.** `postVerifiedPayment()` used the presence of `payment:<id>:posted` in `financialLedger` to finalize a processing payment immediately. `recordPostedPaymentLedger()` writes that ledger event before the separate `walletTransactions` credit event. A failure between them left a durable ledger row that caused every retry to skip the missing wallet event. Recovery now replays idempotent downstream writes after a stale claim; a regression test covers the ledger-success/wallet-failure boundary. See `src/lib/verified-payment-posting.ts`, `src/lib/financial-ledger.ts`, and `src/lib/verified-payment-posting.test.ts`.
2. **Invoice editing did not check posted settlement.** `/api/invoices/update-status` rejected lower-case completed/failed invoices, but its status vocabulary does not consistently match the shared calculator's `PAID` / `PARTIALLY PAID` states. The route could edit amount or status when linked posted payments existed. It now rejects edits when any eligible linked payment has a positive original amount, including fully reversed payments, and includes the previously read status in its update predicate. Cross-collection races between a concurrent post and this edit remain possible without transaction or serialization support.
3. **Invoice-only Daraja callback was a separate posting path.** `src/app/api/owner/invoice-payments/daraja-callback/route.ts` directly changed the payment and invoice status rather than using `postVerifiedPayment()` and `reconcileInvoiceFinancialState()`. It now verifies that the invoice is owned by the payment owner, preserves the exact amount check, quarantines mismatches, and routes eligible success through shared posting. A duplicate success callback can invoke stale-claim recovery. The route still needs dedicated callback retry and concurrent callback integration tests.
4. **Wallet balance is not replayed from its wallet event log.** `calculateTenantFinancialState()` recomputes wallet credit from payment allocations and `reconcileTenantPaymentAllocation()` writes wallet events as secondary effects. Manual wallet balance writes also exist for the `propertyOwners` product wallet in `src/app/api/update-wallet/route.ts`; that is a different wallet domain. Tenant wallet adjustments and restoration semantics need a complete event taxonomy before the balance source can safely change.
5. **Posting uses durable claims but no MongoDB transaction.** The payment claim, tenant cache/allocation writes, invoice reconciliation, ledger insert and wallet insert are separate operations. The stale claim can now replay deterministic/upsert effects, but the actual deployed transaction topology and stale-claim recovery cadence are unknown. No automated posting reconciler is currently identified in the source scan.
6. **Provider integration is not fully uniform.** Ordinary tenant Daraja and KopoKopo success paths call `postVerifiedPayment()`. The current Tuma endpoint records unauthenticated callback evidence for reconciliation and does not post it; the older helper in `src/lib/tuma-incoming.ts` is not called by that route. Invoice-only Daraja remains a separate direct write path. C2B confirmation similarly records callback evidence as `callback_authenticity_unverified`, so it does not post funds. Stripe and Airbnb flows are separate product payment domains and require their own eligibility rules.
7. **Reversal posting is an event plus projection workflow.** `createPaymentReversal()` reserves against `reversalReservedAmount`, records an idempotent processing ledger event, posts the event, writes wallet reversal effects, then reconciles tenant and invoice state. Event keys and conditional amount reservation protect retries and concurrent limits, but these writes are not transactional. The source audit did not exercise failures at every reversal boundary or verify provider-side refund behavior.
8. **The dry-run reconciliation script is read-only but has not been run.** `scripts/audit-financial-consistency.mjs` scans raw records and can report duplicates, allocation, wallet and invoice discrepancies. It uses a simplified invoice balance (`invoice.amount - payments`) and so does not fully reproduce item, discount or tax policy in `financial-reporting.ts`. No live discrepancy counts are claimed; running it against a configured production URI requires a read-only principal and a reviewed environment.

## Read and write path map

Shared read/projection paths:

- `src/lib/payment-query.ts`: status/identity/amount/date primitives.
- `src/lib/financial-reporting.ts`: payment/reversal deduplication, report projection and invoice amount/reconciliation.
- `src/lib/tenant-payment-allocation.ts` plus `src/lib/utils.ts`: tenant obligation and allocation projection; writes tenant cache, allocations and wallet event records during reconciliation.
- `src/lib/payment-totals.ts`: category totals derived from shared payment rows.
- Owner stats, admin payment summary, report APIs, Excel exports and tenant/owner payment list APIs call the shared services in the reviewed paths.

Financial database write boundaries found in the reviewed source:

- Payment initiation/creation: `src/app/api/tenant/payments/route.ts`, `src/app/api/tenant/payments/manual/route.ts`, `src/app/api/mpesa/stk-push/route.ts`, `src/app/api/owner/daraja/stk-push/route.ts`, `src/app/api/owner/invoice-payments/daraja-stk-push/route.ts`, provider-specific KopoKopo/Tuma/Stripe handlers, and separate Airbnb/lifetime payment handlers.
- Provider completion/update: `src/app/api/mpesa/stk-callback/route.ts`, `src/app/api/owner/daraja/callback/route.ts`, `src/app/api/owner/invoice-payments/daraja-callback/route.ts`, `src/app/api/kopokopo/webhook/route.ts`, `src/app/api/tuma/webhook/route.ts` and `src/app/api/stripe/webhook/route.ts`.
- Shared financial posting and event writes: `src/lib/verified-payment-posting.ts`, `src/lib/financial-ledger.ts`, `src/lib/tenant-payment-allocation.ts`, `src/lib/financial-reporting.ts`.
- Invoice writes outside shared reconciliation include invoice CRUD/status routes and the invoice-only Daraja callback. Tenant cached state is also written by dues/profile/utility routes; these consumers should continue to derive values through `calculateTenantFinancialState()` rather than raw payment totals.
- C2B writes unmatched callback evidence only; it does not currently create a successful payment.

## Tests and next corrections

The focused verification run for this pass is recorded in the task result. Next required work to meet the full master prompt is: define read eligibility separately from internal recovery; replay tenant wallet balances from a complete, validated event model (including manual adjustments and restorations); add a durable incomplete-posting reconciler; improve the dry-run script to use the same invoice policy; and test concurrent callbacks, reversal failure boundaries, legacy allocation fallback, report parity, timezone edges and MongoDB integration behavior where the test topology is available.

No historical data repair was run. No gateway credentials, callback URLs, provider setup, or settlement settings were changed.
