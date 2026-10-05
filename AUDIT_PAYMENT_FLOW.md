# Sorana Property Managers — Tenant Payment Flow Audit

Date: 2026-10-05 (Africa/Nairobi)

Scope: read-only source audit of tenant payments, Daraja/M-Pesa STK and C2B callbacks, Tuma/KopoKopo webhook paths, allocation, dues, utilities, invoices, dashboards, reports, and payment mutation routes. No gateway code, configuration, credentials, routes, or production data were changed.

Live-data limitation: `scripts/audit-financial-consistency.mjs` was inspected but could not run because this environment has no `MONGODB_URI` or `MONGO_URI`. Therefore duplicate-record counts, allocation-mismatch counts, and utility-charge anomalies remain unverified against the database.

## Executive summary

The ordinary tenant flow is:

```text
Tenant dashboard
  -> POST /api/tenant/payments (or /api/mpesa/stk-push via the shared invoice/payment UI)
  -> existing Daraja STK Push
  -> POST /api/mpesa/stk-callback
  -> claimDarajaCallback()
  -> payments row changes pending -> completed/failed/cancelled/timeout
  -> completed rows are aggregated and allocated by tenant-payment-allocation.ts
  -> tenant cached totals/status are rewritten
  -> dashboards, dues, reports and statements read a mixture of the ledger and cached/raw aggregates
```

There is no separate double-entry landlord settlement ledger found for ordinary tenant receipts. Landlord/property income is reconstructed from completed `payments` rows, usually grouped by `propertyId` and `type`.

The Daraja STK callback has the strongest idempotency protection: it claims one payment with a conditional update and unique indexes exist for several provider identifiers. The main residual risks are inconsistent parallel rails and consumers: C2B creates a completed payment directly without tenant allocation/reconciliation; Tuma and KopoKopo update amounts from webhook data without validating against the initiated amount; several calculations still aggregate raw `payment.amount`; and date/category/balance semantics differ across endpoints.

## A. Actual payment flow

### 1. Tenant initiation

The tenant payment request schema accepts `tenantId`, integer positive `amount`, `propertyId`, `userId`, `type` (`Rent`, `Utility`, `Deposit`, `Other`), phone and reference. CSRF and session checks are present. The route loads the property and tenant, but the tenant lookup is by `_id` only; the shown path does not require `tenant.propertyId === propertyId` or validate that the tenant belongs to the selected landlord/property before STK initiation. The property-owner path does validate ownership, but the tenant path relies mainly on `tenantId === userId`.

The request amount is used for STK initiation and for the initial pending row. It is not a financial completion until the callback. The Daraja callback later replaces `payment.amount` with gateway metadata `Amount` when present.

### 2. Daraja callback

`POST /api/mpesa/stk-callback` validates the payload shape, locates the pending row by checkout/transaction/merchant identifiers, retries briefly when the callback arrives before the insert, and atomically claims it. Result code `0` becomes `completed`; cancellation, timeout and other failures become terminal non-completed states.

For a completed ordinary tenant payment, the callback:

1. optionally marks `invoiceId` as completed;
2. loads tenant and property;
3. calculates current rent and utility due values;
4. aggregates completed tenant payments by category;
5. updates cached tenant totals and status;
6. calls `reconcileTenantPaymentAllocation()`;
7. sends notifications; and
8. marks `darajaEffectsApplied`.

The callback acknowledges unmatched callbacks and stores them in `unmatchedMpesaCallbacks`.

### 3. Allocation and dues

`calculateTenantFinancialState()` is the intended shared source for current tenant state. It sums only `status: "completed"` payments, orders them by `paymentDate`/`createdAt`, and allocates explicit categories without redirecting overpayment. Legacy/general payments use deposit -> rent -> utilities -> other, with remaining value becoming wallet credit.

It calculates rent from lease/rent override rules, fixed utilities from property configuration, and metered utilities from posted `utilityCharges`. It then persists `allocation`, `totalRentPaid`, `totalUtilityPaid`, `totalDepositPaid`, `walletBalance`, and `paymentStatus` to the tenant document.

### 4. Other rails

* `POST /api/tuma/webhook` matches a payment by callback IDs and applies `applyTumaPaymentUpdate()`.
* `POST /api/kopokopo/webhook` verifies its signature, matches a KopoKopo payment and updates its status/amount/invoice.
* `POST /api/mpesa/c2b-confirmation` resolves a landlord shortcode and invoice reference, then inserts/upserts a completed payment directly.
* Manual payments are inserted as completed by `/api/tenant/payments/manual`, then trigger a separate HTTP dues recalculation.

These rails do not all execute the same allocation/reconciliation path.

## B. Financial data model and source of truth

### Payment document fields observed

Observed fields include `_id`, `paymentId`, `tenantId`, `landlordId`/`ownerId`, `propertyId`, `invoiceId`, `amount`, `type`, `status`, `paymentDate`, `createdAt`, `updatedAt`, `transactionId`, `checkoutRequestId`, `merchantRequestId`, `provider`, `paymentMethod`, `reference`, `mpesaCode`, phone, result code/description, gateway-specific IDs, `allocation`, `utilityChargeId`, `utilityBillingPeriod`, and `darajaEffectsApplied`.

Classification:

| Field | Classification | Audit conclusion |
|---|---|---|
| Completed payment row + provider receipt | Source of truth | Authoritative transaction evidence, subject to callback validation gaps below. |
| `payment.amount` | Source/derived by rail | Client/request amount at initiation; Daraja amount is replaced from callback; Tuma/KopoKopo can replace it from webhook data. |
| `payment.allocation` | Derived cached | Reconstructable from completed payments and current dues; can be absent/stale. |
| `tenant.totalRentPaid`, `totalUtilityPaid`, `totalDepositPaid`, `walletBalance`, `paymentStatus` | Cached duplicated | Reconstructable; multiple routes rewrite these values. |
| `utilityCharges` | Source of posted metered charges | Unique posted key is declared for tenant/utility/period. |
| `invoice.status` / `paidAt` | Duplicated status cache | Callback paths mark invoices completed; invoice balance is often recomputed from payment rows for PDFs. |
| landlord/property income totals | Derived raw aggregate | Mainly completed payment sums, not a settlement/reconciliation ledger. |

## C. Status flow

Observed statuses include `pending_stk`, `pending`, `completed`, `failed`, `cancelled`, `timeout`, `expired`, `reversed` and provider-specific normalized states. The shared tenant ledger counts only `completed` rows. Pending/failed/cancelled Daraja callbacks do not enter dues. The KopoKopo and Tuma routes have separate normalization and side-effect behavior; `reversed`/`refunded` are not a complete ordinary-tenant reversal workflow and no normal tenant refund/reversal recalculation path was found.

## D. Findings

### P1 — Critical: C2B can create a completed financial payment without reliable tenant identity or ledger reconciliation

* Location: `src/app/api/mpesa/c2b-confirmation/route.ts`.
* Root cause: tenant inference uses only `invoice.unitType` plus landlord/property and takes one matching tenant; the payment is inserted/upserted as completed and the invoice is marked completed, but tenant allocation/reconciliation is not called.
* Example: two tenants in the same property share a unit type; a valid invoice reference is paid, and the first matching tenant receives the payment association—or `tenantId` is null—while property income includes the receipt.
* Impact: cross-tenant attribution, invoice/tenant divergence, and dashboards disagreeing with payment history.
* Recommendation: require an unambiguous invoice-to-tenant relationship and route all successful C2B receipts through the same validated idempotent ledger/reconciliation service. Add provider transaction uniqueness and amount/reference checks.

### P2 — Critical: gateway amount is not checked against the initiated/internal amount

* Locations: `src/lib/daraja-callback.ts`, `src/lib/tuma-incoming.ts`, `src/app/api/kopokopo/webhook/route.ts`.
* Root cause: the callback/webhook amount overwrites `payment.amount` when positive; no comparison to the initiated amount, invoice total, or remaining balance is performed.
* Example: pending row says KES 10,000, provider callback says KES 5,000; the stored transaction becomes KES 5,000. Conversely, a malformed or wrong matched webhook amount can increase the financial row.
* Impact: amount tampering or provider/reference misassociation can change rent, utility, invoice and income totals.
* Recommendation: retain `requestedAmount`, require exact/approved variance rules against gateway amount and the server-side obligation, quarantine mismatches, and never silently overwrite the original amount.

### P3 — High: KopoKopo/Tuma replay protection is weaker than Daraja

* Locations: `src/app/api/kopokopo/webhook/route.ts`, `src/app/api/tuma/webhook/route.ts`, `src/lib/tuma-incoming.ts`.
* Root cause: webhooks update an existing payment, but there is no equivalent terminal claim/effects-applied conditional transition for all side effects. Tuma stores every webhook and applies updates; KopoKopo can repeatedly update the same row. The payment indexes cover Daraja identifiers and `providerTransactionId`, but no equivalent unique provider ID is visibly enforced for Tuma/KopoKopo records.
* Impact: repeated callbacks can repeat invoice/referral side effects and produce inconsistent status/amount history; concurrent callback processing is not uniformly serialized.
* Recommendation: use a provider-neutral payment-event/idempotency key, conditional terminal transition, immutable event log, and one transaction/outbox for downstream effects.

### P4 — High: parallel completion paths do not consistently reconcile tenant balances

* Locations: C2B confirmation, KopoKopo webhook, parts of Tuma processing, and invoice status routes.
* Root cause: some paths mark `payments`/`invoices` completed but do not call `reconcileTenantPaymentAllocation()` or the shared state calculator.
* Impact: `payment.amount`/reports can show a receipt while tenant cached totals, allocations, wallet, overdue and arrears remain stale.
* Recommendation: make one server-side “post verified payment” application service mandatory for every provider and manual path.

### P5 — High: tenant/property relationship validation is incomplete in STK initiation

* Location: `src/app/api/tenant/payments/route.ts`.
* Root cause: request-supplied `tenantId` and `propertyId` are both accepted; property is loaded separately and tenant is loaded by ID, without an explicit tenant-to-property equality/lease/owner check in the shown route.
* Impact: a compromised tenant session/request could initiate a payment row linked to a different property or route gateway money using inconsistent metadata.
* Recommendation: derive tenant/property/owner/invoice/category from authenticated server-side relationships; reject mismatches before gateway initiation.

### P6 — High: non-atomic read/modify/write synchronization can race

* Locations: callback and `reconcileTenantPaymentAllocation()`, plus manual payment -> separate `/api/tenants/check-dues` fetch.
* Root cause: payments are inserted/claimed, then aggregates and tenant cache are recalculated in separate operations; manual insertion commits before recalculation; no MongoDB transaction or version check spans payment posting and cache update.
* Example: two completed callbacks recalculate from different snapshots and the last tenant update wins. The shared calculator can reconstruct correctly later, but cached values and notifications can temporarily be wrong.
* Impact: stale balances/status, duplicate notifications, and race-dependent dashboards.
* Recommendation: make payment posting idempotent and transactional where supported, or treat tenant caches as disposable projections rebuilt by a serialized job.

### P7 — High: invoice status is not a reliable payment balance source of truth

* Locations: callback/C2B/KopoKopo paths and `src/app/api/invoices/generate/route.ts`.
* Root cause: callbacks set invoice `status: completed` for any successful linked payment, while invoice PDFs/generation sum all completed `payments.invoiceId` amounts and can represent partial/overpaid amounts. `calculateInvoiceTotals()` separately supports partial payment, but the callback does not use it to set status/balance.
* Impact: a partial payment can mark an invoice completed; invoice status and computed balance diverge.
* Recommendation: calculate invoice amount paid from valid payment ledger entries and set status (`DUE`, `PARTIALLY PAID`, `PAID`, `OVERDUE`) from the result; keep stored status as a projection.

### P8 — High: manual payment amount/date/category are trusted as operator input with no obligation-bound or precision policy

* Location: `src/app/api/tenant/payments/manual/route.ts`.
* Root cause: positive amount is accepted, reference uniqueness is tenant-scoped, and payment is immediately completed. There is no maximum/obligation check, immutable audit snapshot, or explicit minor-unit/decimal normalization before insert.
* Impact: overpayments become wallet credit by later allocation; incorrect dates/categories can change period/category reporting. Deletion removes the source row rather than preserving a reversal/audit event.
* Recommendation: preserve operator intent in an audit event, use server-side allocation validation, integer minor units or one consistent decimal policy, and reverse/void rather than hard-delete posted financial events.

### P9 — Medium: raw payment totals and shared ledger can disagree on category allocation

* Locations: `src/lib/payment-totals.ts`, owner stats/charts, reports and `src/lib/tenant-payment-allocation.ts`.
* Root cause: raw totals sum completed `payment.amount` by declared `type`; the shared allocator caps explicit category allocation at current due and sends excess to wallet. General/missing-type legacy rows are handled by the allocator but omitted from `payment-totals` category totals.
* Impact: payment history/property income can show full KES X while tenant rent/utility paid shows only the allocated portion; legacy/general payments may disappear from category totals.
* Recommendation: reports should consume posted ledger allocations for category totals and separately show unapplied credit.

### P10 — Medium: utility payment period/category context is incomplete for old and some new rows

* Locations: manual route adds `utilityChargeId`/`utilityBillingPeriod` only for the oldest posted charge; STK initiation does not set these fields; allocator allocates utilities globally across all periods.
* Root cause: utility payments are typed `Utility` but not consistently linked to a specific utility charge/billing period. Allocation is category-based, not charge/period-based oldest-first.
* Impact: a September utility payment can reduce an aggregate utility balance while a specific September/October charge remains ambiguous; statements cannot prove period application.
* Recommendation: require an invoice/charge allocation table with billing-period IDs and deterministic oldest-due-first or explicitly selected allocation.

### P11 — Medium: billing-period and timezone rules are inconsistent

* Locations: `property-utilities.ts`, `ownerstats.ts`, `ownercharts.ts`, `reports.ts`, callback date formatting.
* Root cause: some code uses local `getFullYear()/getMonth()`, some UTC defaults, some compares ISO strings, and gateway transaction dates are stored/used inconsistently. The callback parses Daraja `YYYYMMDDHHmmss` as `+03:00`, but reporting windows use server-local `Date` boundaries.
* Impact: month-end payments can appear in different months in Kenya versus a UTC/server-local report; current versus overdue utility classification can shift at boundaries.
* Recommendation: define Africa/Nairobi business-period helpers and store event time in UTC plus an explicit business period derived once from that timezone.

### P12 — Medium: reversal/refund and edit/delete lifecycle is incomplete

* Locations: payment mutation routes and status unions.
* Root cause: only manual payments are deletable; deletion removes the payment and then recalculates. No ordinary tenant reversal/refund event flow was found that restores invoice status, landlord income, statements and audit history. Provider normalized states include reversed/refunded in some code but shared tenant aggregation only accepts completed rows.
* Impact: a reversed provider payment may remain reflected in cached/report data until a recalculation, or lack a traceable compensating event.
* Recommendation: use immutable payment events and compensating reversal/refund entries; prohibit destructive deletion of posted financial events.

### P13 — Medium: unaudited invoice/wallet mutation path can mark invoices paid outside provider evidence

* Location: `src/app/api/update-wallet/route.ts`, `src/app/api/invoices/update-status/route.ts`.
* Root cause: authenticated owner wallet updates accept a client amount and optional reference, and reference can mark an invoice completed; invoice update allows direct amount/status edits. These paths are outside the provider-confirmed tenant ledger and do not show CSRF protection in the inspected route.
* Impact: invoice status/amount can diverge from payment records and reports; if exposed to a cross-site request, state mutation risk increases.
* Recommendation: deprecate or strictly scope these paths, require CSRF and authorization, and only mark paid from verified payment events.

## E. Calculation audit

* Rent due: derived from `calculateTenantRentDueToDate()` and rent overrides. Rent paid: completed rows allocated by type/ledger. Cached `totalRentPaid` is not authoritative.
* Utilities: fixed utilities are monthly configuration × billable months × units. Metered utilities use current minus previous reading and rate, rounded to whole KES. Posted charge uniqueness is declared per tenant/utility/period.
* Utility outstanding: shared ledger subtracts all completed utility-category allocations from aggregate fixed + metered due, not a charge/period ledger.
* Overdue: shared state reports rent outstanding and overdue utility charge component; deposits and penalties are excluded from `overdueAmount` but included in `totalOutstanding`. Other routes calculate dues differently and can include penalties in rent dues.
* Partial payments: supported by the allocator, but invoice callback status handling is not consistently partial-aware.
* Overpayments: explicit categories produce wallet credit; general payments can also create wallet credit. There is no visible wallet consumption transaction ledger; wallet is reconstructed from payment sequence.
* Rounding: invoice calculations use two decimal places; utility charges use whole KES; allocator uses two decimals; STK requires integer amounts. This is an inconsistent currency precision policy.

## F. Security and callback validation

Positive controls found: CSRF on the main tenant/STK and manual routes; owner/property checks on manual utility recording; Daraja payload schema validation; conditional Daraja callback claim; unique indexes for Daraja checkout/merchant/receipt and payment IDs; KopoKopo HMAC signature verification; unmatched callback quarantine.

Gaps: no visible Daraja amount/obligation validation; no provider-neutral event idempotency across all rails; C2B tenant ambiguity and no amount-to-invoice validation; incomplete tenant/property relationship validation at tenant STK initiation; direct invoice/wallet mutation paths; inconsistent server-side source derivation for category, period and amount.

## G. Recommended fix order (after this audit)

1. **Critical:** secure C2B identity/amount mapping; create one verified-payment posting service; validate gateway amount against the server-side request/obligation; preserve original requested amount.
2. **High:** unify Tuma/KopoKopo/Daraja/manual idempotency and side effects; add transactional/versioned projection updates; enforce tenant-property-owner-invoice relationships; make invoice balances ledger-derived.
3. **Medium:** replace raw category aggregates with allocation aggregates; introduce period-specific utility allocation; standardize Africa/Nairobi period handling; implement immutable reversals/refunds and audit events.
4. **Low:** consolidate status enums, remove duplicate cached calculations, standardize money precision and report formatting.

## H. Verification still required with a safe read-only database run

Once a read-only database connection is provided, run `node scripts/audit-financial-consistency.mjs` and additionally query:

* duplicate completed rows by provider transaction ID, checkout ID, merchant ID, receipt and reference;
* completed rows without allocation and allocation sum mismatches;
* utility payments missing charge/period context;
* utility charge meter amount mismatches and duplicate posted periods;
* completed payments whose tenant/property/owner relationships disagree;
* invoices marked completed with zero or partial completed payment sums;
* completed provider payments with no `darajaEffectsApplied`/equivalent event marker;
* cached tenant totals versus recomputed `calculateTenantFinancialState()`.

