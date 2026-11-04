# System-wide financial calculation audit and correction

Audit date: 2026-11-04 (Africa/Nairobi)

## Findings

- The owner dashboard summed deposit paid for every tenant on selected properties, but summed deposit due only for current occupants. Former tenants with unpaid deposits therefore broke the portfolio reconciliation.
- Owner and property queries in the dashboard, charts, tenant list, property list, and tenant detail paths assumed IDs were strings in several places. Historical BSON `ObjectId` values could be filtered out even when the tenant-to-property relationship was valid.
- The active payment cascade treated declared categories as interchangeable. New Rent and Utility receipts could reduce security deposits, and a Deposit receipt above its expected amount could be reclassified as rent. This conflicted with the required category isolation.
- Owner dashboard amounts were rounded to whole KES even though tenant ledger balances retain cents.
- The legacy `/api/tenant/dues` summary used only active tenants for its overdue amount, omitted propertyless legacy payment rows from report totals, and used host-local month boundaries.

## Changes

- Reused `calculateTenantFinancialState()` as the balance source. Deposit paid and deposit due are now summed from the same tenant population, including former tenants attached to the selected active properties. Deposit due remains `max(0, expected deposit - deposit received)`; deposit receipts above the expected amount remain deposit collections and never become rent.
- New verified receipts use allocation policy `category-directed-v2`: Rent applies to rent, Utility to utilities, Deposit remains deposit, and category overpayments stay in a wallet lot restricted to that category. General receipts retain the existing general cascade. Existing saved allocation snapshots and `deposit-first-v1` records keep their historical behavior; no transaction was rewritten.
- Owner totals retain two decimal places. Owner/property identity filters now accept both string and BSON `ObjectId` representations while continuing to scope results through the authenticated owner, property, and team-member assignment.
- The legacy owner dues summary now derives its overdue amount from all tenant financial states, counts overdue active tenants separately, includes legacy propertyless receipts through tenant links, and uses Nairobi month boundaries.
- Tenant list/detail pages continue to obtain financial values from the shared dues calculation. The deposit detail note now uses the calculated deposit due when available.

## Accounting and invoice behavior

Successful payment eligibility and posted reversals continue through `payment-query.ts` and `financial-reporting.ts`; pending, failed, cancelled, reversed, and quarantined rows do not reduce balances. Stored allocation snapshots remain the historical source for old receipts. Invoice-linked tenant dues continue to use invoice obligation references to prevent an issued invoice from duplicating its underlying rent or utility obligation. No invoice or payment history was changed.

The source scan found no deposit-specific refund or adjustment workflow. Posted reversals continue to reduce the original receipt under the existing reversal rules. A separate refundable-liability settlement cannot be represented by this tenant payment ledger today and should be added only with an explicit accounting event model.

## Validation

- Focused allocation, financial reporting, tenant dues, and owner dashboard route tests: 59 passed.
- Owner dashboard route test compares totals with the underlying tenant states, including a former tenant, and verifies BSON `ObjectId` owner matching.
- Full test suite (`--maxWorkers=1 --no-file-parallelism`): 256 passed, 1 skipped, 2 failed. Both failures are in the existing impersonation route tests: one timed out and one requires MongoDB at `localhost:27017`, which is unavailable. The route classification test was updated for the existing `webhooks` and `whatsapp-preferences` namespaces; provider route tests passed in the serial run.
- `pnpm lint`: passed with existing repository warnings and no lint errors; ESLint on all changed source files passed without warnings.
- `pnpm exec tsc --noEmit`: passed.
- `pnpm build`: passed, including production compilation, type validation, and static page generation.

No production database was queried or modified. No migration, historical reallocation, or automatic balance adjustment was performed. Existing legacy allocations are preserved; any inconsistent old allocation snapshots still require review through the read-only reconciliation tooling.
