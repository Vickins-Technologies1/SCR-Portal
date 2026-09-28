# Sorana performance optimization report

## Scope and safety

This phase was read-only during the audit, followed by one focused, reversible optimization. Existing uncommitted payment/integration changes were preserved and were not modified by this phase.

No production database, credentials, payment configuration, or business rules were changed.

## Audit baseline

| Area | Baseline finding |
| --- | --- |
| Application | Next.js 16.2.3, React 19, TypeScript, MongoDB native driver plus Mongoose |
| Codebase | 463 TypeScript/TSX source files, approximately 88,131 lines |
| API surface | 184 `route.ts` API handlers |
| Database | Native MongoDB is used by most API routes; production index bootstrap contains indexes for owners, properties, tenants, payments, invoices, notifications, referrals, and related collections |
| Dashboard | Owner dashboard requests properties, stats, and charts concurrently from the browser |
| Chart bottleneck | `ownercharts` ran 18 payment aggregations sequentially: six months × rent, utility, and deposit |
| Runtime measurements | No live MongoDB, production traffic, browser trace, or server telemetry was available in this workspace; endpoint latency, query plans, CPU, memory, and LCP therefore remain unmeasured |
| Baseline build | Fails during prerendering at `/lifetime/checkout` because `useSearchParams()` is not inside a Suspense boundary |
| Baseline tests | 58 passed and 1 skipped; 3 suites fail before execution because the existing `server-only` package cannot be resolved |

## Optimization implemented

### Owner dashboard chart queries

- Problem: three independent payment aggregations were awaited one after another for every month.
- Solution: retained the exact filters, aggregation stages, month ordering, response fields, and numeric handling, while executing the three independent aggregations with `Promise.all()` per month.
- File: `src/app/api/ownercharts/route.ts`
- Expected impact: lowers the database/network critical path for each month from the sum of three query latencies to approximately the slowest query latency. Total query count remains 18, so this is a latency optimization rather than a database-load reduction.
- Risk: low. No payment writes, allocation, status, authorization, or response contract changed.
- Validation: lint passed; diff check passed; production TypeScript compilation completed before the build reached prerendering; no new test failure is attributable to this file.

## Before / after measurements

| Metric | Before | After |
| --- | --- | --- |
| Chart aggregation calls | 18 | 18 |
| Sequential chart query batches | 18 | 6 (three concurrent queries per month) |
| Response shape | Existing `chartData` | Unchanged |
| Live latency | Not available | Not available; requires representative MongoDB data and traffic |
| Bundle size / LCP / CPU / memory | Not measured | Not measured |

## Intentionally not changed

- Payment and callback flows, including tenant-to-property-owner routing and invoice payments.
- Authentication, authorization, CSRF, rate limiting, subscriptions, referrals, invoice calculations, and notification semantics.
- Database indexes: the repository already has a broad index bootstrap, but adding indexes without `explain()` plans and production cardinality would be speculative.
- Owner stats calculations: several reads are candidates for safe parallelization, but that should be benchmarked with query-plan and connection-pool data before increasing concurrent database pressure.
- Frontend bundles, images, CSS, caching, and background processing: no browser trace or asset profile was available to prove a safe high-value change.

## Remaining blockers

1. Fix the existing `/lifetime/checkout` Suspense/prerender failure before using production builds as a complete performance baseline.
2. Make the test environment resolve or mock the existing `server-only` import, then rerun all suites.
3. Capture representative endpoint timings, MongoDB `explain("executionStats")`, query counts, pool saturation, browser traces, and bundle reports before selecting the next optimization.

## Phase 2 investigation and changes

### Existing blockers resolved

- `src/app/lifetime/checkout/page.tsx`: wrapped the existing client checkout content in `Suspense`. Query parameter parsing, checkout requests, payment polling, and UI behavior are unchanged.
- `vitest.config.ts` and `src/test/server-only.ts`: added a Vitest-only alias for Next.js's runtime marker module. Production code is unchanged.

### Phase 2 measurements

| Check | Result |
| --- | --- |
| Tests | 19 suites passed, 1 skipped; 64 tests passed, 1 skipped |
| Lint | Passed |
| TypeScript | Passed with `tsc --noEmit` |
| Production build | Passed; 227 static pages generated |
| Static JS/CSS output | 353 assets, approximately 4.51 MB uncompressed |
| Largest static chunks | 416.6 KB, 403.8 KB, and 216.8 KB uncompressed; exact ownership requires a bundle analyzer/source-map inspection |
| MongoDB explain plans | Not run: the configured URI was not used to connect because its environment and data scope could not be safely established as non-production |
| Runtime latency/CPU/memory | Not measurable in the current workspace |

### Implemented optimization: owner stats read path

- Problem: after loading the property list, five independent reads were awaited serially: unit count aggregation, rent overrides, tenant count, active tenants, and monthly-overlap tenants.
- File: `src/app/api/ownerstats/route.ts`
- Before behavior: five queries/helper reads executed sequentially; query count unchanged.
- Change: execute those same five reads with `Promise.all()` after the property IDs are known.
- After behavior: same filters, aggregation, data, calculations, bulk status update, and response shape; only independent I/O overlaps.
- Query count: unchanged; exact count depends on helper implementations.
- Execution time: not measurable without a representative database and request trace.
- Database impact: higher per-request concurrency for this group, bounded by the existing MongoDB pool configuration (`maxPoolSize: 20` in production native-driver routes). No index or write change.
- Memory impact: no material increase expected; results were already all required downstream.
- Risk: low.
- Validation: full tests, lint, TypeScript, diff checks, and production build passed.

### Dashboard and query audit findings

- Property-owner dashboard source makes three initial API requests concurrently: properties, owner stats, and owner charts.
- `ownercharts` now retains 18 aggregation calls but reduces its sequential critical path to six monthly batches, with three independent aggregations per batch.
- `ownerstats` has multiple payment aggregations and a tenant payment-total read remaining in series. These are candidates for further work, but should be measured against MongoDB pool saturation before increasing concurrency further.
- Highest static query-count files are `src/lib/referrals.ts` (25), `src/app/api/properties/route.ts` (12), `src/app/api/tenants/[tenantId]/route.ts` (11), and `src/app/api/admin/airbnb/overview/route.ts` (10). Static counts are not execution counts and are not proof of a bottleneck.
- No Mongoose `populate()` calls were found in the source query audit, so no populate/lean change was justified.
- Existing pagination is present in key notification/list endpoints; broad response-shape reductions were not applied because frontend consumers and contract compatibility require runtime verification.

### Index decisions

No indexes were added or removed. The repository already has a production index bootstrap, and safe index selection requires collection cardinalities plus `executionStats` for representative queries. Adding speculative indexes would increase write and storage cost without measurable evidence.

### Remaining bottlenecks

High:

- Owner stats and report/payment aggregations need production-like `explain()` plans and endpoint timings.
- Largest shared client chunks need bundle ownership analysis before any dependency or code-splitting change.

Medium:

- Several API handlers retrieve multiple collections sequentially; each needs dependency and traffic analysis before parallelization.
- Large list/report endpoints need payload-size and browser-consumer measurements before projection changes.

Low:

- Static asset compression and cache-header review; no deployment proxy configuration or browser waterfall was available.

Recommended next phase: capture sanitized staging traces for the owner, tenant, admin, payments, invoices, and reports flows; collect MongoDB `executionStats` and payload sizes; then select only changes supported by those measurements.

## Phase 3 profiling methodology and results

### Profiling methodology

Phase 3 used static source inspection, production compilation, test execution, generated bundle inspection, and an opt-in runtime profiler. No production database connection or production credential was used.

Runtime profiling is controlled by:

```text
SORANA_PERFORMANCE_PROFILING=true
SORANA_PERFORMANCE_SLOW_QUERY_MS=100
```

When enabled, API middleware records method, route, status, duration, and available response content length. The MongoDB client records only slow/succeeded command metadata or failed command metadata: command name, duration, and request ID. Query filters, command payloads, request bodies, secrets, and payment data are not logged. The feature is inactive unless explicitly enabled.

### Bottlenecks discovered

- Owner dashboard chart work still consists of 18 aggregations, but independent monthly type queries now overlap.
- Owner stats contained five independent reads serialized after property discovery; those reads now overlap.
- Static query counts identify `src/lib/referrals.ts` (25), `src/app/api/properties/route.ts` (12), `src/app/api/tenants/[tenantId]/route.ts` (11), and `src/app/api/admin/airbnb/overview/route.ts` (10) as investigation candidates, not proven runtime bottlenecks.
- Generated static assets total approximately 4.51 MB across 353 JS/CSS assets. Largest chunks are approximately 416.6 KB, 403.8 KB, and 216.8 KB uncompressed. Bundle ownership and browser transfer timing remain unmeasured.
- No safe evidence was available for a new index, projection change, Mongoose `lean()` change, populate change, cache, or response-contract reduction.

### Optimizations implemented

| File | Endpoint | Change | Risk |
| --- | --- | --- | --- |
| `src/lib/mongodb.ts` | All native MongoDB routes, opt-in only | Added slow-command instrumentation behind the profiling flag; no default behavior change | Low |
| `src/proxy.ts` | All API routes, opt-in only | Added API duration/status/response-length instrumentation after the handler completes | Low |
| `src/app/api/ownerstats/route.ts` | `GET /api/ownerstats` | Parallelized five independent reads while preserving queries and calculations | Low |

### Before/after measurements

| Metric | Before | After | Measurement status |
| --- | --- | --- | --- |
| Ownerstats read group | Five serialized reads | Five concurrent reads | Query count unchanged; latency not measured without a database workload |
| Ownercharts monthly group | Three serialized queries | Three concurrent queries | Query count unchanged; latency not measured without a database workload |
| API runtime timing | Not collected | Available when explicitly enabled | Requires staging traffic |
| MongoDB command timing | Not collected | Available for slow/failed commands when explicitly enabled | Requires safe staging MongoDB |
| Tests | 64 passed, 1 skipped | 73 passed, 1 skipped | Measured locally |
| Build | 227 static pages | 227 static pages | Measured locally; passed |

### Optimizations deliberately deferred

- No index changes: `explain("executionStats")`, collection cardinality, and representative workload are required.
- No projection or `.lean()` changes: downstream consumers and API compatibility need route-level verification.
- No further payment/report aggregation rewrites: financial and payment semantics are protected and runtime evidence is unavailable.
- No bundle dependency removal or broad code splitting: largest chunks are known, but dependency ownership and browser traces are not.
- No cache or response-shape changes: invalidation and consumer compatibility are not proven.

### Regression testing

- Tests: 73 passed, 1 skipped across 21 passing and 1 skipped test file.
- Lint: passed.
- TypeScript: passed.
- Production build: passed; 227 static pages generated.
- Payment regression: no payment or integration files were changed by Phase 3; no live payment calls were made.

### Remaining limitations

Actual API latency, MongoDB execution plans, response payload sizes, browser LCP/TTI, CPU, memory, event-loop delay, and external-provider timings require a safe staging deployment with representative data and traffic. The profiler is now available to collect those measurements without exposing sensitive query contents.
