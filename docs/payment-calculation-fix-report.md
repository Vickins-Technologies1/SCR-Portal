# My Accurate Rent — Phase 2 Payment Calculation Fix Report

## Scope and status

Phase 2 corrections for findings F-01 through F-07 are implemented in application code and covered by unit tests. Project validation passed with one existing test skipped. No production services were contacted, no reminders were sent, no database records or schema were changed, and no deployment was performed.

## Finding-by-finding results

| Finding | Re-evaluation and change | Regression coverage and result | Remaining uncertainty |
|---|---|---|---|
| **F-01 — rent overdue before configured due day** | Confirmed. `calculateTenantRentDueToDate()` still accrues the full rent charge for applicable periods, and now separately computes overdue rent from each period's Nairobi due date. Payment day comes from property configuration, with the lease commencement day as fallback. A charge becomes overdue only after its due date. | `tenant-payment-allocation.test.ts` covers before/on/after due date, prior-month arrears while current rent is not yet due, and a February clamp; `business-time.test.ts` covers leap year. Passed in focused runs. | No grace-period configuration was found in the inspected calculation path. Existing behavior is kept: due date itself is not overdue; the following business date is. Lease end and partial-period policy were not redesigned. |
| **F-02 — typed receipts bypass deposit-first** | Confirmed. New unsnapshotted receipts now use deposit → rent → utilities → other regardless of declared category. Chronological processing, wallet credit, overpayment, and reversal projection are retained. | Allocation tests cover Rent, Utility, Deposit, Other, and General; partial/excess payment cases and reversal-aware report projection pass. | Provider callback and manual-posting integrations were not exercised against a live or isolated database. |
| **F-03 — current obligations restate historical payment categories** | Confirmed. Persisted allocation snapshots are used for historical receipts, prorated only for recorded reversals. Current allocation overrides were removed from dashboard/report consumers. Legacy rows without snapshots use a deterministic declared-category projection; General or untyped legacy rows project to wallet credit. New verified receipts are marked for deposit-first allocation and receive a snapshot during posting/reconciliation. | `financial-reporting.test.ts` covers persisted category splits, reversals, duplicate documents, and preservation when current dues change. Passed. | Legacy records with no category and no snapshot cannot be reconstructed reliably; they are left as wallet credit rather than historically invented category values. No backfill was run. |
| **F-04 — Excel month grouping differs from Nairobi reporting** | Confirmed. Shared `Africa/Nairobi` month/date helpers now drive report filters, on-screen month grouping, dashboard buckets, and Excel grouping. | Financial reporting tests cover receipts on both sides of Nairobi month-end and year rollover boundaries; business-time tests cover UTC/Nairobi boundary conversion. Passed under both host `TZ=UTC` and `TZ=Africa/Nairobi`. | The UI/API/export combination was not exercised end-to-end with a database fixture; parity is established through the shared helper and unit tests. |
| **F-05 — mixed-obligation reminders are labelled as rent only** | Confirmed. Automatic, manual, and alternate-path reminders now show rent, utilities, deposit, and penalties separately, then a rounded total. The heading is “Payment Reminder”; penalty is not folded into rent. Current state is recalculated before dispatch. | Reminder message and amount tests verify separate penalties and exact component totals. Passed. | Real SMS, WhatsApp, email, and in-app delivery was deliberately not run. Provider delivery and idempotency remain production-runtime concerns. |
| **F-06 — reminder dates depend on host timezone** | Confirmed by source inspection; deployment behavior was runtime-dependent. Shared Nairobi helpers now drive reminder eligibility, date keys, due dates, lease date-only parsing, invoice reminder dates, and report date display. Cron schedules were left unchanged. | Business-time boundary/leap tests and the focused suite passed under `TZ=UTC` and `TZ=Africa/Nairobi`. | Deployed host timezone and cron execution timing were not observed. The configured schedule itself was not changed. |
| **F-07 — dashboard overdue labels/status conflate deposits and penalties** | Confirmed. `overdueAmount` remains overdue rent plus overdue utilities; deposit and penalties do not make a tenant overdue. Owner cards/charts, tenant dues, profile updates, utility charge updates, and dashboard help text now use that meaning. | Allocation tests verify deposit and penalty exclusion and status helper behavior. Passed. Dashboard/API behavior was validated by source inspection and type/build checks, not a database-backed route test. | Existing persisted status values are updated when the affected reconciliation paths run; no bulk status rewrite was performed. |

## Financial rules and cross-consumer evidence

- **Current balances:** the shared tenant financial state derives current obligations, net payments, valid reversals, wallet balance, overdue amounts, and penalties. Rent is still charged according to the existing accrual behavior; overdue rent is a separate due-date-based subset.
- **New allocations:** a KSh 700 receipt against KSh 500 deposit, KSh 1,000 rent, and KSh 100 utilities allocates KSh 500 to deposit, KSh 200 to rent, and KSh 0 to utilities for each declared payment category. This is covered by the allocation matrix tests.
- **Historical receipts:** reports, charts, and exports use the posted allocation projection instead of recomputing category splits from current dues. Net reversal amounts prorate the original snapshot. No historical records were rewritten in this task.
- **Transaction periods:** receipt event-date semantics were preserved. The reporting regression fixture places receipts immediately before and at Nairobi month boundaries and checks their month/category totals.
- **Reminders:** amounts use current outstanding rent, utilities, deposit, and penalty once each; the reminder tests verify the displayed component sum equals the reported total.
- **Scope of reconciliation:** unit tests establish the common calculations and period rules. No single database-backed integration fixture compared a live tenant balance, dashboard API, report API, Excel response, and reminder dispatch in one run.

## Validation

| Command | Result |
|---|---|
| `$env:TZ = 'UTC'; pnpm exec vitest run src/lib/business-time.test.ts src/lib/tenant-payment-allocation.test.ts src/lib/financial-reporting.test.ts src/lib/reminder-calculations.test.ts src/lib/reminders.test.ts src/lib/property-utilities.test.ts` | Passed, 56 tests. |
| Same focused command with `$env:TZ = 'Africa/Nairobi'` | Passed, 56 tests. |
| `pnpm exec vitest run src/app/api/owner/invoice-payments/daraja-callback/route.test.ts src/app/api/admin/invoice-payment-provider/route.test.ts src/app/api/mpesa/stk-push/route.test.ts --maxWorkers=1` | Passed, 3 tests. These use test mocks; no live payment provider was contacted. |
| `pnpm test` (parallel/default workers) | Two runs encountered five-second timeouts in existing provider-flow tests under suite load. A later run had 1 timeout, 195 passed, 1 skipped. The failing M-Pesa provider test passed in isolation and in the serial full suite below. |
| `pnpm exec vitest run --maxWorkers=1` | Passed, 52 test files; 196 passed, 1 skipped (197 total). |
| `pnpm exec tsc --noEmit` | Passed. |
| `pnpm lint` | Passed with 0 errors and 95 warnings (existing warning-level findings across `src`). |
| `pnpm build` | Passed. Next.js compiled successfully, typechecked, and generated all 239 static pages. It emitted the existing Edge Runtime static-generation warning. |
| `git diff --check` | Passed; Git reported line-ending normalization notices for modified files. |

## Changed files

- **Shared time and financial logic:** `src/lib/business-time.ts` (new), `src/lib/utils.ts`, `src/lib/property-utilities.ts`, `src/lib/tenant-payment-allocation.ts`, `src/lib/financial-reporting.ts`, `src/lib/verified-payment-posting.ts`.
- **Regression tests:** `src/lib/business-time.test.ts` (new), `src/lib/tenant-payment-allocation.test.ts`, `src/lib/financial-reporting.test.ts`, `src/lib/property-utilities.test.ts`, `src/lib/reminder-calculations.test.ts`, `src/lib/reminders.test.ts`.
- **Dashboard and reporting consumers:** `src/app/api/ownerstats/route.ts`, `src/app/api/ownercharts/route.ts`, `src/app/api/property-charts/route.ts`, `src/app/api/reports/route.ts`, `src/app/api/generate-excel/route.ts`, `src/app/property-owner-dashboard/page.tsx`, `src/app/property-owner-dashboard/reports/page.tsx`.
- **Tenant status and dues consumers:** `src/app/api/tenant/dues/route.ts`, `src/app/api/tenant/profile/route.ts`, `src/app/api/tenants/check-dues/route.ts`, `src/app/api/utility-charges/[id]/route.ts`.
- **Reminder composition and display:** `src/lib/reminders.ts`, `src/lib/reminder-calculations.ts`, `src/lib/invoice-reminders.ts`, `src/lib/email.ts`, `src/app/api/notifications/reminders/route.ts`, `src/app/api/notifications/route.ts`, `src/app/property-owner-dashboard/notifications/page.tsx`.
- **Posting compatibility:** `src/app/api/mpesa/stk-callback/route.ts` carries the deposit-first policy marker for new verified receipts.

No dependencies, API contracts, environment variables, database schemas, or cron schedules were changed.

## Remaining risks and final status

Application logic, regression tests, typechecking, lint, and production build are validated. The implementation is **partially validated for production behavior** because no isolated database integration environment was available for cross-API reconciliation, and no provider delivery or deployed cron/runtime behavior was exercised. Legacy payments without allocation snapshots retain the deterministic compatibility projection described above; a future data-repair policy would require a separately reviewed migration plan.
