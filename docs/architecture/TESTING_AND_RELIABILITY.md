# Testing and reliability

## Test setup in repository

`package.json` exposes `pnpm test` (`vitest run`) and `pnpm test:e2e` (`vitest run -c vitest.e2e.config.ts`). Unit config uses Node environment, `src/**/*.test.ts`, aliases `@` to `src`, and maps `server-only` to `src/test/server-only.ts`. E2E config includes `src/e2e/**/*.e2e.test.ts`. A single CSRF E2E-style file was found under `src/e2e`.

There are 32 discovered `*.test.ts`/`*.spec.ts`/`*.e2e.test.ts` files in the source tree at audit time. Major test subjects include tenant allocation/occupancy, financial ledger/invariants/consistency, payment query, invoice calculations/PDF, Daraja callback, Tuma incoming, utility and rent overrides, reminders, Airbnb payments/bookings/listings/messaging/taxes/metrics, referrals, SMS and admin features. File existence does not establish current test pass status.

## Execution status

No tests, lint, typecheck or production build were run for this documentation task. This respects the request to avoid application side effects and keeps the audit focused on source; existing project notes report prior test/build outcomes from different changesets, which are historical evidence rather than current verification.

No live MongoDB, external provider, real payment, production data, destructive fixture, deployment or callback replay test was performed.

## Coverage gaps to prioritize

| Priority | Workflow | Recommended tests |
| --- | --- | --- |
| P0 | Authorization and isolation | Cross-owner property/tenant/payment/invoice IDs; team-member permission boundaries; public/unmapped API route auth; suspended owner; tenant cannot read/write another tenant |
| P0 | Payment posting | Daraja/Tuma/KopoKopo/C2B/manual success, failure, timeout, duplicate event, concurrent callbacks, requested/confirmed mismatch, duplicate receipt, tenant-property mismatch, quarantine recovery |
| P0 | C2B reconciliation | Unique invoice-to-tenant mapping, partial receipts, exact-balance payment, overpayment quarantine, duplicate TransID and malformed reference |
| P0 | Financial projections | Allocation totals equal net payment; reversals restore due; invoice amountPaid/balance/status reconcile; wallet credit/consumption event parity; dashboard/report/statement agreement |
| P1 | Cron safety | Unauthenticated cron requests denied; duplicate job invocation; partial job failure and retry; reminder idempotency |
| P1 | Date and money | Africa/Nairobi month boundaries, UTC provider timestamps, leap/month-end leases, whole-KES STK vs cents, rounding and negative values |
| P1 | Integration security | Invalid/stale signatures for Stripe/KopoKopo, Daraja/Tuma authenticity controls, callback replay and body mutation |
| P2 | Uploads and notifications | File type/size/path validation, public/private storage permissions, OTP/log redaction, provider timeout/failure behavior |
| P2 | Reliability | Mongo transient outage, index bootstrap delay/failure, stale posting claims, email/SMS outage and error-monitor fallback |

## Reliability observations

The project has meaningful domain unit tests and uniqueness/idempotency mechanisms. Main reliability gaps are lack of a verified CI gate in repository config, no proven integration/concurrency test environment, multi-write financial posting without a transaction/outbox, reliance on provider callback retries, synchronous scheduled jobs and unverified recovery/monitoring operations. Runtime performance and query plans cannot be assessed without representative telemetry and database access.
