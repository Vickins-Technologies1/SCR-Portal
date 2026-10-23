# My Accurate Rent — Payment Calculation Audit

**Phase:** Investigation only  
**Audit date:** 2026-10-23 (Africa/Nairobi)  
**Method:** Read-only source inspection; no live database connection used.

## A. Executive Summary

The current tree has meaningful financial consolidation: `payment-query.ts` defines eligible payment statuses, mixed string/ObjectId identifiers, posted amount preference, event-date precedence and money rounding. `financial-reporting.ts` applies posted reversals, and `tenant-payment-allocation.ts` derives tenant balances. Owner dashboard cards, charts, reports and scheduled payment reminders now call these common helpers in several important paths. This is substantially more consistent than independent raw `amount` summations.

The most important confirmed defect is in overdue rent: `calculateTenantRentDueToDate()` includes the entire current month's rent from the first day of the month, while `deriveTenantFinancialState()` sets `overdueRent = rentOutstanding` without comparing the configured rent payment day to the as-of date. Before the rent due day, the owner dashboard can count current-month rent as overdue. A second confirmed conflict is that a payment's declared category is the first allocation target, even when a security deposit remains due. That contradicts the requested deposit-first rule for categorized Rent/Utility/Other payments.

Other confirmed inconsistencies include dashboard card copy saying overdue includes deposits although its source formula excludes them; payment reminder messages labeled “Rent reminder” whose total can include utilities, deposit and penalties; and Excel report month grouping based on UTC ISO date prefixes while on-screen report and dashboard grouping use Nairobi calendar months. Dashboard cards and charts are broadly sourced from the same ledger but their current-month boundaries and independent request times can differ slightly.

The audit cannot establish actual discrepancies in tenant records or quantify impact: no production database was inspected and no isolated fixture-based end-to-end reconciliation was run. Provider lifecycle, write concurrency, older reports, and invoice reminder delivery were source-inspected but require runtime or database follow-up. No application code or data was changed. The only intended repository change is this report.

## B. Existing Financial Business Rules

### Payment source and eligibility

- `getFinancialPaymentRows()` is the shared reporting read path. It filters to statuses `completed`, `successful`, `success`, `paid`, and `settled` plus eligible financial posting states. It matches string and ObjectId references, prefers `postedAmount`, then `providerConfirmedAmount`, then `amount`, and selects event date in this order: `paymentDate`, `providerTransactionDate`, `completedAt`, `paidAt`, `createdAt` (`src/lib/payment-query.ts:11-17, 48-72, 79-103`; `src/lib/financial-reporting.ts:174-234`).
- Posted `PAYMENT_REVERSED` rows reduce the original payment's net amount. Stored allocations are prorated against net amount; legacy rows without allocations are assigned to their declared type, while missing type becomes wallet credit (`src/lib/financial-reporting.ts:140-167`). Full reversals can also change payment status (`src/lib/financial-ledger.ts:208-214`).
- This projection distinguishes gross/original, reversed, net, category allocation and unapplied credit. Dashboard card “Total Payments” uses **net** receipts; the Reports screen shows categorized net allocations, not a raw transaction amount per receipt.

### Tenant dues and allocation

- Rent due-to-date comes from lease units, monthly rent overrides and lease start, charging each month through the current month (`src/lib/utils.ts:379-455`). Fixed utility charges accrue by billing month and due date; metered utilities use posted charges (`src/lib/property-utilities.ts:225-263, 293+`). Required deposit is derived from tenant/unit configuration (`src/lib/tenant-payment-allocation.ts:327-366`).
- The allocator processes successful eligible payments in event-date order, then ID order. It sends a payment first to its declared type (`Deposit`, `Rent`, `Utility`, `Other`), then cascades to other outstanding categories in the fallback order deposit → rent → utilities → other. General/missing-type payments use that fallback order from the start. Only excess after all current obligations are satisfied becomes wallet credit (`src/lib/tenant-payment-allocation.ts:122-144, 146-246`).
- Therefore the implemented rule is **declared category first, then deposit-first fallback**, not unconditional deposit-first. This is a direct mismatch with the supplied requirement for deposit-first initial payments.
- Outstanding balances are charged minus ledger allocation. `overdueAmount` is overdue rent plus overdue utilities, excluding deposit and penalties; `totalOutstanding` adds deposit, rent, utilities and penalties (`src/lib/tenant-payment-allocation.ts:281-320`). Rent overdue classification currently equates all rent outstanding with overdue rent, despite the configured due day being used for penalty calculation.
- Reconciliation persists allocation snapshots and tenant cached totals/status (`src/lib/tenant-payment-allocation.ts:384-471`). These are derived projections, not the authoritative payment source.

### Ambiguities in business semantics

- The supplied instructions say deposit-first allocation, while code honors the explicit payment category first. Whether *all* payment types must ignore a selected category until deposit is cleared should be confirmed before implementation.
- The current dashboard “Overdue Amount” excludes both deposit and penalties, but its UI description says “unpaid rent + deposits.” The requirement explicitly excludes deposits; penalties are surfaced separately, and should remain separately presented unless product rules say otherwise.
- Rent reporting assigns categorized payment allocations to the payment event month. The ledger allocates against aggregate obligations as-of the calculation date, not invoice/month-specific rent charges. Historical restatement policy (transaction-date reporting versus obligation-period reporting) is not clearly defined.
- Reminder eligibility is calendar-event based (five days before and on due date), not a recurring overdue schedule. Product semantics for post-due reminders and deposit reminders are unclear.

## C. Dashboard Cards Audit

Frontend: `src/app/property-owner-dashboard/page.tsx:471-480, 597-694`. API: `src/app/api/ownerstats/route.ts:195-205, 247-360`.

| Metric | Source and formula | Result / issue |
|---|---|---|
| Monthly revenue / Monthly Rent | `monthlySummary.rentReceived`: allocated rent from eligible net payment rows whose event date is from Nairobi month start through current instant (`ownerstats:247-281`). | Shared ledger category, but “monthly revenue” is named more broadly than rent. The “Monthly Rent” helper text says completed payments only, while query also accepts legacy successful/paid/settled statuses. No expected-versus-collected percentage is shown. |
| Expected Monthly Revenue | Sum of effective monthly rent for tenants overlapping current month (`ownerstats:332-341`). | Projected rent, not charges raised or necessarily amount payable as of today. Tenant status/occupancy semantics differ from lifetime collection totals. |
| Total Rent Paid | Lifetime allocated rent from eligible payment rows (`ownerstats:255-281`). | Ledger-based and consistent with deposit/utility category allocations; excludes dates after `today`. Not tied to a filter period. |
| Total Payments | Lifetime net posted receipts (`lifetimeSummary.netReceived`, `ownerstats:255-283`). | Gross receipts are not displayed here. This is net of posted reversals, including any unallocated portions. |
| Deposit Due | Sum `state.depositOutstanding` across active tenant states (`ownerstats:285-325, 343-359`). | Deposit obligation outstanding; not an overdue deposit measure. Excludes inactive/ended tenants from the due total. |
| Overdue Amount | Sum `state.overdueAmount` across active tenant states (`ownerstats:292-326, 356`). Formula is overdue rent + overdue utilities; excludes deposits and penalty. | Formula matches explicit requirement but **UI description is wrong**: it says rent + deposits (`page.tsx:644-650`). Also includes current month rent before its configured payment day (Finding F-01). |
| Overdue Tenants | Count active tenants whose `state.overdueAmount > 0` (`ownerstats:285-300`). | Inherits F-01 false positives before rent due date. Deposit-only and penalty-only debts are not counted, though tenant `paymentStatus` may be set to overdue by `totalOutstanding > 0` (`ownerstats:303-314`). The metric label therefore differs from the persisted tenant status meaning. |
| Late Payment Penalties | Sum `state.penalties` for active tenant states (`ownerstats:288-296, 356-357`). | Separately exposed; penalty calculation is based on rent dues and configured due date/frequency in `utils.ts:466+`. |
| Deposits | Sum ledger `state.depositPaid` across all tenants tied to selected owner properties (`ownerstats:320-325, 358`). | Includes ended tenants as held deposits; does not include overpayment to deposit category if allocator sent it elsewhere. Reasonable if “held deposits” is intended; label/help text should clarify. |
| Utilities Paid | Lifetime ledger utility allocation (`ownerstats:255-283, 359`). | Consistent with category allocation, but allocation is aggregate across utility periods rather than strictly period-specific. |
| Total Tenants / Properties / Vacancies | Tenant counts, property count and unit occupancy aggregation (`ownerstats:221-245`, `page.tsx:259-263`). | Not payment calculations; occupancy is based on active lease helper. |

The API also writes tenant `paymentStatus` on a GET request (`ownerstats:303-329`). Its meaning is full outstanding balance, while `overduePayments` counts rent/utilities overdue only. This causes a semantic mismatch for deposit-only or penalty-only debts.

## D. Dashboard Charts Audit

The owner dashboard renders a tenant overdue/current pie and a six-month stacked category collection chart (`src/app/property-owner-dashboard/page.tsx:265-315, 768+`). Both are fed by `/api/ownercharts`; the collection card is fed independently by `/api/ownerstats` (`page.tsx:214-241`).

| Chart | Data calculation | Reconciliation / risk |
|---|---|---|
| Current vs overdue tenants pie | “Overdue” = `stats.overduePayments`; “Current” = `activeTenants - overduePayments`; lease expired is hard-coded zero (`page.tsx:265-278`). | This is a visualization of the overdue count, not persisted `paymentStatus`. Deposit-only/penalty-only balances can be tagged overdue by tenant reconciliation but counted “Current” in pie; pre-due rent can be counted overdue due F-01. No lease-expired count is actually calculated. |
| Six-month rent / utility / deposit / other / wallet trend | `ownercharts` constructs Nairobi calendar buckets, queries eligible rows for the window, obtains current tenant allocation overrides, groups each row by event date, then sums allocation categories (`ownercharts:138-208`). | Same common payment set and tenant allocator as cards. Categorized month sums should reconcile to same-period allocated receipts, subject to F-03 and near-midnight boundary/request timing. It is a transaction-month chart, not a charge/accrual chart. Deposits are explicitly separate. |
| Expected vs actual | No distinct expected/actual series found on this dashboard. | Monthly card compares current-month rent collected to an expected monthly rent amount; it does not calculate a collection rate or chart historical expected charges. |
| Outstanding over time / property/tenant comparisons | No owner dashboard financial outstanding-over-time or tenant/property comparison chart found in dashboard page. | Not implemented in this dashboard scope. |

The card uses local API current time; charts use the same call's time but are separate requests launched concurrently. A payment posted between requests can create a transient mismatch. There is no cache visible in these paths, but there is no shared point-in-time snapshot across the two endpoints.

## E. Reports Page Audit

### Payment report

UI is `src/app/property-owner-dashboard/reports/page.tsx:362-385, 594-598, 665-695`; API is `src/app/api/reports/route.ts:315-413`. It is a categorized **receipt allocation** report: one row per nonzero allocation category, with `revenue` equal to net category allocation. A single payment can produce multiple report rows (unique UI row ID combines payment ID and category). Thus the on-screen total equals allocated net receipts over the filtered rows, not raw payment count or original/gross amounts.

Filters: selected owner properties, optional selected property, payment category and inclusive business dates. Date strings are explicitly interpreted as Africa/Nairobi day boundaries (`reports/route.ts:331-363`). The API maps property and tenant details and has no pagination/limit in the payment query. It fetches tenant current allocations and applies those to historical receipt rows (`:343-367`). Rows with missing tenant link are labeled “Unknown”; legacy propertyless rows are included only for currently linked tenant IDs.

The UI chart groups the already-filtered report rows by Nairobi month (`reports/page.tsx:665-683`) and therefore reconciles to the displayed report data total for a stable response. It is not an independent finance calculation. The top revenue total is a client reduction of the current report rows (`:594-598`).

### Excel export

UI posts selected property/category/date filters to `/api/generate-excel` (`reports/page.tsx:600-663`). The server ignores client-supplied rows and totals, re-queries the eligible ledger projection, recomputes allocations and verifies owner/team-member property scope (`src/app/api/generate-excel/route.ts:64-157`). This is sound for data integrity. It has no pagination and loads the full selected period in memory. **Confirmed period mismatch:** `groupByMonth()` uses `r.date.slice(0,7)` on UTC ISO strings (`generate-excel/route.ts:47-61`, rows emit ISO at `:133-157`); on-screen charts group by Africa/Nairobi (`reports/page.tsx:672-677`). A receipt between 21:00 and 23:59 UTC on month-end belongs to the next Nairobi month but prior UTC month; year rollover can differ too (Finding F-04).

### Invoice reports and exports

The Reports page includes an invoices tab as well as payment reports (`reports/page.tsx` tab logic around `:144-154`). Invoice amounts/status are recomputed from immutable invoice billing fields and net eligible linked payments in `calculateInvoiceFinancialState()` (`src/lib/financial-reporting.ts:249-287`), using `calculateInvoiceTotals()` (`src/lib/invoice-calculations.ts`). Invoice APIs include `/api/invoices`, `/api/invoices/excel`, `/api/invoices/generate` and status/manual payment routes. These represent invoice balance/status, which is conceptually different from owner rent/property collection. They are not reconciled to rent charge/utility/deposit obligations. Invoice export source-inspected but no rendered export or production data comparison was run.

No separate owner-facing arrears, rent-charged, utilities-charged, or deposit aging report was found in the Reports payment listing. The property reports branch of `/api/reports` reports occupancy/property stats rather than payment ledger rows (`src/app/api/reports/route.ts:102+`).

## F. Automatic Reminders Audit

### Scheduling and dispatch

- Vercel schedules `/api/cron/send-payment-reminders` and `/api/cron/send-invoice-reminders` at `0 6 * * *` (`vercel.json:4-16`). The payment route authorizes cron and uses a distributed lock, then calls `sendPaymentReminders()` (`src/app/api/cron/send-payment-reminders/route.ts:8-25`). Invoice reminders follow the same guarded/locked pattern (`send-invoice-reminders/route.ts:7-24`).
- Owner UI can list upcoming payment reminders and trigger sending via `/api/notifications/reminders`; routes call shared `getUpcomingPaymentReminders` / `sendPaymentReminders` (`src/app/api/notifications/reminders/route.ts:140-141, 245-253`). Manual POST also has a different notification composition path beginning around `:320+`; that separate path should be retained in implementation follow-up review.
- Payment reminders run for active properties, active tenants and active leases; they occur five days before or on payment day (`src/lib/reminders.ts:170-243`). A reminder key includes owner, tenant, type and due date; notification rows are claimed/idempotently retried, with unique reminder index declared in `src/lib/db-indexes.ts` and claim logic at `reminders.ts:247-277, 391-435`.
- Before sending, the service computes tenant state as of the due date's local end-of-day and re-reads it immediately before dispatch (`reminders.ts:279-321`). This avoids relying on cached tenant totals and reflects completed payments visible at that second read. A race remains possible after the re-read and before provider delivery.

### Amount and message

Payment reminder amounts are `rentOutstanding + penalties`, full `utilitiesOutstanding`, and `depositOutstanding`, summed as `totalDue` (`reminders.ts:323-328`). This is based on the shared tenant calculator, but **message content labels the total “Rent reminder” while it can include utilities, deposit and penalties** (`reminders.ts:115-165`). It includes a breakdown for rent/utilities/deposit; penalties are folded into rent with no separate line. The email/SMS/WhatsApp senders receive the same values (`:438-495`). This is confirmed content/semantic inconsistency (F-05).

Date calculations (`startOfDay`, due date, date key and `toLocaleDateString`) use host-local time and no explicit Africa/Nairobi timezone (`reminders.ts:58-85, 225-245, 333-338`). On UTC-hosted runtime, the due day and displayed date can differ from Nairobi business date, though actual deployed runtime behavior was not observed (F-06, runtime-dependent). Cron at 06:00 UTC would be 09:00 Nairobi if Vercel uses UTC; schedule syntax alone is not timezone annotated.

### Invoice reminders

Invoice reminder selection is by invoice `expiresAt` today or five days ahead, excluding several terminal statuses (`src/lib/invoice-reminders.ts:55-72`). It recalculates invoice balance from eligible net linked receipts and only emails if balance is positive (`:141-155`). Deduplication uses a reminder key/log and processing claim (`:122-139, 200+`). The message is an owner invoice notification, not tenant rent reminder. Date calculations likewise use server-local boundaries (`:32-47, 55-72`). This subsystem does not calculate tenant rent/utility/deposit due and should not be conflated with payment reminder balances.

## G. Deposit, Rent, and Utility Reconciliation

- **Separation:** ledger categories track deposit/rent/utilities/other/wallet separately. Dashboard totals and category charts consume those allocations. Reports emit a separate category row for every nonzero category. This reduces raw `amount` double counting.
- **Deposit-first:** not consistently enforced. Categorized payments target their declared type first; only remainder cascades deposit-first. A Rent payment can reduce rent while a deposit remains outstanding. If unconditional deposit-first is the required policy, the current allocator is defective (F-02).
- **Outstanding:** tenant balances use obligation totals less allocated net payment amounts. This is more reliable than reading cached `total*Paid`, but rent overdue incorrectly treats all current rent due-to-date as past due before configured payment day (F-01).
- **Utilities:** fixed utility due date uses property payment day; metered utility charges use posted status and are aggregated by tenant. Utility allocations can be projected oldest-first to concrete charges during reconciliation (`tenant-payment-allocation.ts:428-455`), but category balance derivation itself is aggregate; historical period-specific invoice/application semantics remain limited.
- **No double counting in intended summary:** report summary counts a payment document once (`financial-reporting.ts:54-90`); detailed categorized report may split it into category rows, but each allocation slice is a component and sums to net under consistent allocations. Verify allocation sums for legacy/corrupt rows using a database reconciliation before relying on this invariant operationally.

## H. Root Cause Analysis

### F-01 — Rent outstanding is treated as overdue before the rent payment day

- **Severity:** High.
- **Location:** `src/lib/tenant-payment-allocation.ts:281-316`; rent charge source `src/lib/utils.ts:379-455`; dashboard aggregation `src/app/api/ownerstats/route.ts:285-326`.
- **Current behavior:** current-month rent is included in rent due-to-date from the first of the month; `overdueRent` is assigned the full `rentOutstanding`. `rentPaymentDate` does not gate rent overdue, although it is used in penalty calculation and fixed utility due logic.
- **Expected:** rent should be overdue only after the applicable rent due date under the established policy; do not call future/current not-yet-due rent overdue.
- **Example:** on the 2nd, rent day is the 5th, tenant has paid all prior months but not this month. Current state has current-month rent outstanding and classifies it as overdue. Owner overdue amount/count can be overstated.
- **Affected:** owner overdue amount/count, overdue/current pie, tenant payment status (GET writes it), due summary, manual reminder balance if sent on that calculated due date or configuration edge.
- **Correction direction:** model rent current versus overdue by due-period, similar to utility breakdown, then aggregate only periods whose due date has passed. Preserve an explicit rent due-date policy and test grace-period semantics.

### F-02 — Payment type priority bypasses unconditional deposit-first requirement

- **Severity:** High.
- **Location:** `src/lib/tenant-payment-allocation.ts:122-144, 193-203`.
- **Current behavior:** category field is first allocation target; deposit-first applies only to missing/general category or after declared category is satisfied.
- **Expected:** per supplied audit requirements, outstanding deposit clears first, then remaining rent and utilities according to established ordering.
- **Example:** deposit 500, rent 1,000, utility 100 outstanding; a `Rent` payment of 500 applies to rent under code and leaves deposit 500, rather than clearing deposit.
- **Affected:** tenant balances, deposit due/deposits collected cards, payment chart category, report rows and reminder due breakdown.
- **Correction direction:** settle the policy ambiguity and make the priority deterministic in one allocator; add scenario A/B/C regression coverage before rollout.

### F-03 — Current allocations restate category slices in historical payment periods

- **Severity:** Medium; policy-dependent.
- **Location:** tenant state computes allocations against current aggregate dues (`tenant-payment-allocation.ts:249-320, 342-380`); owner stats and chart pass these current overrides into event-month summaries (`ownerstats/route.ts:263-275`; `ownercharts/route.ts:155-196`); reports do the same (`reports/route.ts:348-367`).
- **Current behavior:** payment is placed in its transaction/event month, but its rent/deposit/utility category split is recalculated from current obligations and current policy/state, not frozen obligation-period allocations. A later rent or utility change can change historical category month bars/rows while net receipt date remains the original month.
- **Expected:** depends on accounting rule. If reports are cash-basis by receipt month, original allocation should be stable or restatement policy explicit. If reallocation is intended, historical exports should be identified as current restated allocation.
- **Example:** a utility configuration/lease charge changes, then rederived category allocations shift a past receipt between utility and rent; old monthly chart changes despite no new receipt.
- **Affected:** dashboard trend, reports and Excel category totals; underlying total net receipts are not necessarily changed.
- **Correction direction:** define immutable posted allocation snapshots versus restated allocation. If snapshots are canonical, do not silently override them for historic reports; expose adjustments/reallocations as ledger events.

### F-04 — Excel monthly grouping uses UTC instead of Nairobi business month

- **Severity:** Medium.
- **Location:** `src/app/api/generate-excel/route.ts:47-61, 133-157, 259-285`; screen grouping at `src/app/property-owner-dashboard/reports/page.tsx:665-683`.
- **Current behavior:** server emits ISO timestamp; Excel `groupByMonth()` slices UTC prefix. Screen chart formats event date in `Africa/Nairobi`.
- **Expected:** same defined business timezone for chart and exported month summaries.
- **Example:** 2026-08-31 22:30 UTC is Sep 1 01:30 Africa/Nairobi; screen groups September while workbook's UTC prefix groups August.
- **Affected:** monthly Excel subtotal/bucket, though detail row and overall total can still match.
- **Correction direction:** bucket by explicit Nairobi month key shared with report/chart code; verify year boundary and end-of-day filters.

### F-05 — Reminder message calls mixed obligations a rent reminder

- **Severity:** Medium.
- **Location:** `src/lib/reminders.ts:115-165, 323-355`.
- **Current behavior:** total combines rent outstanding plus penalties, utilities and deposit. SMS fixed text says “Rent reminder”; penalties have no distinct breakdown line.
- **Expected:** message title and amount description identify exactly which obligations and penalties are included, or send category-specific notices.
- **Example:** rent 0, utility 200, deposit 500 => message says “Rent reminder: Ksh 700 due” with utility/deposit tags, which can confuse the tenant about the rent balance.
- **Affected:** SMS, WhatsApp, app and email notices; notification `dueAmounts` breakdown.
- **Correction direction:** align displayed title, breakdown and total definition; decide whether deposit belongs in routine rent reminders.

### F-06 — Reminder day logic relies on runtime local timezone

- **Severity:** Medium, runtime-dependent.
- **Location:** `src/lib/reminders.ts:58-85, 170-243, 333-338`; invoice reminders `src/lib/invoice-reminders.ts:32-72, 180-185`; cron schedules `vercel.json:4-16`.
- **Current behavior:** `Date` local getters/setters and locale formatting without `timeZone` determine day, due date, key, and displayed date. Cron expressions have no timezone field.
- **Expected:** consistent Africa/Nairobi business date and explicit schedule basis.
- **Example:** a UTC server runs the 06:00 cron as 09:00 Nairobi, but reminder `todayStart` is UTC midnight; property due day near local date rollover may select another day than tenant-facing date. Actual production host timezone was not inspected.
- **Affected:** payment/invoice reminder eligibility, duplicate keys by due date, due date text.
- **Correction direction:** adopt explicit Nairobi calendar helpers and test UTC-host behavior around midnight, month end and leap-year boundaries.

### F-07 — Owner dashboard labels overstate or conflate overdue/status meanings

- **Severity:** Low to Medium.
- **Location:** `src/app/property-owner-dashboard/page.tsx:644-650`; `src/app/api/ownerstats/route.ts:292-314`; pie `page.tsx:265-278`.
- **Current behavior:** card says rent + deposits although API deliberately sums rent + overdue utilities and excludes deposits. Separately, tenant persisted status uses any `totalOutstanding`, but overdue count/pie use `overdueAmount` only.
- **Expected:** labels match formula, and “overdue” count aligns to the intended obligation scope.
- **Example:** deposit-only tenant may have persisted status `overdue` but be shown as current in pie and excluded from overdue tenant count.
- **Affected:** card comprehension and current/overdue pie.
- **Correction direction:** align copy and define whether status means any balance or past-due balance; do not infer one from the other.

## I. Reconciliation Test Matrix

No fixtures were inserted and no tests were run. Expected outcomes below use the supplied policy plus code-established transaction behavior. These cases are proposed verification, not production results.

| Case | Expected | Source-level actual / verification status | Validation still required |
|---|---|---|---|
| A Fully paid deposit | Deposit outstanding reaches zero; rent remains until paid, provided payment covers deposit and allocation policy is deposit-first. | For `Deposit` typed payment, deposit is first target. Static path supports scenario. **Not runtime executed.** | Fixture with deposit/rent outstanding and deposit-typed payment; verify cards/report/reminder. |
| B Partial, deposit + rent + utility | Payment reduces deposit first; remainder follows agreed rent/utility order. | General payment defaults deposit-first; typed Rent/Utility prioritizes its declared category first (F-02). **Confirmed policy conflict.** | Repeat with each declared type and capture all categories. |
| C Deposit cleared, partial rent | Remaining rent/utilities correct; one net payment split once; no duplicate totals. | Allocator and report summary deduplicate same payment ID, but categorized rows split by category. **Static confidence only.** | Check category allocations sum to net and card/chart/report totals reconcile. |
| D Rent/utilities overdue + unpaid deposit | Overdue card includes rent and overdue utilities only; excludes deposit. | API sum excludes deposit and penalties; UI description claims it includes deposits (F-07). Rent due-day misclassification can overstate rent overdue (F-01). **Formula confirmed; value not verified.** | Cases before/after rent due date and utility due date. |
| E Manual payment | Tenant state, owner metrics, chart/report, later reminder all reflect posted transaction. | Manual route inserts then invokes verified posting/reconciliation (`manual/route.ts:259-305`); all consumers use common projection. **No end-to-end execution.** | Isolated fixture/route mocks; test reminder recheck after posting. |
| F Reversal/failure | Failed/cancelled excluded; posted reversal reduces net amount and dues. | Eligibility excludes failure/cancelled/reversed statuses; reversal ledger reduces net and can mark fully reversed row (`payment-query.ts:11-17`; `financial-reporting.ts:224-234`; `financial-ledger.ts:208-214`). **Static path supports; provider edge cases unverified.** | Partial and full reversal, duplicate idempotency, tenant projection + exports. |
| G Historical reporting | Current balance reduced; collection attributed under documented accounting-period policy. | Payment event date selects report month; current allocations can restate historical category slices (F-03), plus Excel UTC bucket mismatch (F-04). **Mismatch confirmed in code; values not run.** | Month-end and obligation-month/event-month examples. |
| H Multiple tenants/properties | No cross-property/tenant contamination or duplicate aggregation. | Owner scope filters properties; report and Excel use property IDs plus tenant link for legacy propertyless rows (`reports:315-364`; `generate-excel:96-130`). **Static scope inspected only.** | Read-only DB anomaly query and multi-tenant/property fixtures, including mismatched legacy identifiers. |

## J. Recommended Fix Plan

1. **Correct due-state semantics (F-01, F-07).** Define when a rent charge becomes overdue; split current rent from past-due rent by payment day and grace period. Align tenant status, dashboard count, pie labels and card help text.
2. **Resolve and enforce allocation policy (F-02).** Confirm whether deposit-first overrides explicit payment type. Then encode the single rule in `allocatePaymentLedger()` and add scenarios A-C before any consumer-specific change.
3. **Set historical allocation policy (F-03).** Decide whether category splits are immutable at posting or intentionally restated. Keep receipt transaction date separate from obligation period and represent corrections explicitly.
4. **Unify reporting timezone (F-04, F-06).** Reuse Africa/Nairobi month/day boundaries in on-screen reports, exports, payment reminders, invoice reminders and schedule interpretation.
5. **Clarify reminder contents (F-05).** Decide inclusion of deposits and penalties. Make subject/title, breakdown, due amount and notification metadata use the same financial definition.
6. **Run read-only live reconciliation.** With an explicitly read-only Mongo principal, compare ledger eligible rows to tenant allocations, owner card totals, monthly chart, report/export totals and reminder balances. Existing `scripts/audit-financial-consistency.mjs` is a candidate; its configured connection was not available during this audit.

### Shared source recommendation

Keep `payment-query.ts` + `financial-reporting.ts` as the transaction eligibility/net projection, and `tenant-payment-allocation.ts` as the obligation/tenant state engine. They are already shared in owner cards/charts/reports/reminders. Do not merge their responsibilities: payment receipt reporting and current obligation balances answer different questions. Extend them with an explicit as-of business timezone and charge-period allocation policy rather than duplicating formulas in UI or endpoints.

## K. Regression Prevention

- Unit test allocation priority for declared Deposit/Rent/Utility/Other/General, partial payments, multiple chronological payments, overpayment wallet credit and reversal proration.
- Test current versus overdue rent one day before, on, and after rent due date; lease start/end and due-day 29/30/31; penalty grace/frequency.
- Assert tenant state balances and allocation sum invariants, including `net receipt = allocated categories + wallet credit` with wallet application represented separately.
- Cross-consumer fixture test: same posted ledger fixture feeds tenant dues, owner cards, monthly chart, payment report, Excel server dataset and reminder due breakdown; all category and net totals reconcile.
- Exercise Nairobi month-end/year-end and UTC-host midnight for API filters, screen chart, Excel groups, reminder eligibility and reminder keys.
- Test failed/cancelled/expired/pending/quarantined/excluded rows, legacy successful statuses, string/ObjectId IDs, missing event dates, partial/full reversals, duplicate webhook events and manual payments.
- Add multi-tenant/multi-property isolation cases and propertyless legacy row linkage cases.
- Keep production reconciliation read-only and report anomaly counts; make any repair/rebuild a separately reviewed operation.

## L. Final Audit Status

- **Fully source-traced:** common payment eligibility/net projection; tenant allocation and dues calculation; owner dashboard financial cards and owner charts; payment report and server-side Excel export; scheduled payment reminder calculation and dispatch paths; invoice reminder balance calculation; visible source of payment reversals.
- **Partially verified / could not runtime-verify:** provider-specific lifecycle completion paths across M-Pesa, Tuma, KopoKopo and manual transactions; concurrency and callback races; exact historical behavior with legacy records; invoice export figures; field-by-field runtime tenant/owner reconciliation; actual deployed cron timezone.
- **Production data inspected:** No.
- **Code/data modified:** No application code, schema, database, or financial data modified. This requested Markdown audit report is the only deliverable change.
- **Highest-priority confirmed root causes:** F-01 overdue rent ignores configured rent due day; F-02 typed-payment allocation can bypass required deposit-first; F-04 Excel monthly grouping differs from Nairobi-month report grouping. F-05 reminder wording can misdescribe the total.
- **Recommended next step:** review the due-date and allocation policy decisions, then run read-only database reconciliation and the proposed isolated fixture matrix before creating a separate implementation task.

---

## Source inventory reviewed

Primary code: `src/lib/payment-query.ts`, `src/lib/financial-reporting.ts`, `src/lib/payment-totals.ts`, `src/lib/tenant-payment-allocation.ts`, `src/lib/utils.ts`, `src/lib/property-utilities.ts`, `src/lib/financial-ledger.ts`, `src/lib/verified-payment-posting.ts`, `src/lib/reminders.ts`, `src/lib/invoice-reminders.ts`; `src/app/property-owner-dashboard/page.tsx`, `src/app/property-owner-dashboard/reports/page.tsx`; `src/app/api/ownerstats/route.ts`, `src/app/api/ownercharts/route.ts`, `src/app/api/reports/route.ts`, `src/app/api/generate-excel/route.ts`, `src/app/api/notifications/reminders/route.ts`, `src/app/api/cron/send-payment-reminders/route.ts`, `src/app/api/cron/send-invoice-reminders/route.ts`; and `vercel.json`.

