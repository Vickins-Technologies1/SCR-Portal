# Financial engine

## Financial records and sources of truth

The system stores provider/manual payment documents in `payments`, posted/reversed events in `financialLedger`, wallet events in `walletTransactions`, utility charges in `utilityCharges`, and invoices in `invoices`. A payment is not treated as confirmed merely because an initiation request was accepted: provider paths record pending state and the server-side callback/status path must confirm and post it. Manual recording is an operator-authorized path.

Current source-of-truth hierarchy:

1. Eligible successful payment rows, using `payment-query.ts` status and amount rules.
2. Posted reversal ledger rows subtract from source payment amounts in `financial-reporting.ts`.
3. Stored payment allocations are a projection; legacy records without allocation use category fallback logic.
4. Tenant `totalRentPaid`, `totalUtilityPaid`, `totalDepositPaid`, `walletBalance`, and `paymentStatus` are mutable projections maintained by reconciliation.
5. Invoice `amountPaid`, `balanceDue`, status and `paidAt` are projections reconciled by `reconcileInvoiceFinancialState()`.

`financialLedger.eventKey` and `walletTransactions.eventKey` are unique in the production index declaration. This provides durable event identity for the events that use those collections, but most payment/tenant/invoice side effects are multiple Mongo writes rather than one transaction/outbox operation.

## Rent and dues

Rent due is derived from tenant occupancy and rent data through `calculateTenantRentDueToDate()` and rent override helpers. Fixed property utilities are calculated from property configuration and billing dates; metered charges are recorded in posted `utilityCharges` with tenant, utility and billing period identity. Deposits are resolved from tenant/property unit type data through `resolveTenantRequiredDeposit()`. The shared `deriveTenantFinancialState()` calculates rent, utility, deposit, other amounts, outstanding balances, overdue amounts and wallet credit.

Exact effective business rules depend on the tenant's stored lease/start/move-out fields, property utility configuration, override timeline and posted charge records. The source has separate convenience/statistical queries, so values displayed by every endpoint are not guaranteed to use this one projection unless that handler calls it.

## Allocation order and wallet

`src/lib/tenant-payment-allocation.ts` reads eligible financial payment rows and produces a deterministic allocation. It applies the payment's declared category first, then cascades any remaining amount through outstanding obligations; unconsumed excess becomes wallet credit. The allocation tracks rent, utilities, deposit, other and wallet credit. Reconciliation persists allocation fields to payment records and caches aggregate tenant totals. Utility allocations are projected to posted charges in billing-period/creation order.

The wallet event helper records payment credit, credit consumption, restoration/reversal, and manual adjustment kinds. A tenant cached wallet balance remains a projection; the event ledger provides a more durable audit trail where corresponding events are created.

## Payment lifecycle

```mermaid
sequenceDiagram
  participant Actor as Tenant / owner / operator
  participant API as Payment route
  participant Provider
  participant DB as MongoDB
  participant Post as postVerifiedPayment
  participant Alloc as Tenant allocation
  participant Ledger as Financial ledger
  Actor->>API: Initiate or record payment
  API->>DB: Validate access and persist pending/manual payment
  API->>Provider: Provider collection request (if applicable)
  Provider-->>API: Callback or status evidence
  API->>DB: Correlate event and update payment result
  API->>Post: Post verified amount and transaction identity
  Post->>DB: Check amount, relationship, duplicate; claim posting
  alt invalid, mismatch or ambiguous evidence
    Post->>DB: Quarantine or retain unmatched event
  else valid
    Post->>Alloc: Recalculate tenant projection
    Alloc->>DB: Persist allocations and tenant totals
    Post->>DB: Reconcile linked invoice
    Post->>Ledger: Insert idempotent posted event / wallet events
    Post->>DB: Mark financial posting complete
  end
  API-->>Actor: Status/result or receipt access
```

The event order is code-path specific. Some domain payments (lifetime purchase or Airbnb booking) have entitlement/booking side effects instead of ordinary rent allocation. The shared service claims financial posting and uses idempotent ledger keys; it does not wrap all downstream writes in a Mongo transaction.

## Invoice calculations and reports

`src/lib/invoice-calculations.ts` computes subtotal from line items (or amount), discount, tax, total, amountPaid, balanceDue and `PAID` / `PARTIALLY PAID` / `DUE` / `OVERDUE` status, rounding to cents. `getInvoicePostedAmount()` uses the shared eligible payment projection and subtracts posted reversals. `reconcileInvoiceFinancialState()` updates invoice projections. `financial-reporting.ts` distinguishes original receipts, net receipts, category allocation, unapplied credit and legacy unallocated payments.

Owner stats, charts, admin payment screens and older endpoints may also aggregate raw `payments`. Their consistency with the shared financial projection should be confirmed before treating all report totals as identical.

## Reversals and refunds

`financial-ledger.ts` includes `createPaymentReversal()` with idempotency key reservation, remaining-amount reservation, rejection for non-successful/over-limit cases, a posted `PAYMENT_REVERSED` event and downstream tenant/invoice reconciliation. `financial-reporting.ts` applies posted reversal totals as a net projection without mutating the original amount. This is an internal financial reversal mechanism; a provider-side refund or Safaricom reversal API was not established as a general automated path. Operator authorization and route availability are route-specific.

## Reliability, edge cases and remaining concerns

**Positive controls verified:** provider-confirmed amount required for the major provider families; requested-vs-confirmed mismatch quarantining; tenant/property equality check for tenant-linked payment; landlord/property owner equality check when `landlordId` exists; duplicate provider identity check; conditional processing claim; event-key uniqueness; unmatched callback storage; invoice balance reconciliation; partial payments and reversal-aware reports.

**Residual concerns:**

- Posting comprises multiple database writes without a transaction or outbox. A process failure can leave a processing claim or partially updated projections; recovery depends on retry/stale claim handling and later reconciliation.
- `postVerifiedPayment()` validates `landlordId` when present but does not visibly require every payment to carry/validate all ownership fields. Legacy and short-stay rows have different shapes.
- Some older direct mutation/aggregate routes remain. For example, `/api/invoices/update-status` blocks setting completed status and says posted payments control paid state, but still permits pending/failed status and amount edits for selected records; every consuming report should be checked for projection consistency.
- Process-local rate limits and async callbacks can allow simultaneous cross-request work; posting claims mitigate payment duplicates but do not provide a global transaction across all financial effects.
- Money uses JavaScript numbers rounded to two decimals, while STK requires integer KES amounts and utility calculations may round to whole KES.
- Date inputs include provider timestamps, ISO strings and JavaScript Dates. The business timezone is not uniformly centralized across all billing/report endpoints.
- Future wallet application is modeled in allocation/event logic; whether every wallet consumption path is always recorded and reconciled needs workflow-level verification.

## Test coverage

Unit tests exist for allocation, ledger, financial invariants, consistency, invoice math, payment queries and utility rules. A safe live-data reconciliation was not run. See [Testing and reliability](TESTING_AND_RELIABILITY.md) and [Architectural risks](ARCHITECTURAL_RISKS.md).
