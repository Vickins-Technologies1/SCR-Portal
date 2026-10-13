# Application architecture

## Technology and execution model

| Area | Implementation |
| --- | --- |
| Framework | Next.js `^16.1.6`, App Router |
| UI | React `^19.0.0`, TypeScript `^5` |
| Styling | Tailwind CSS 4/PostCSS plus `src/app/globals.css`, `src/styles/global.css` |
| Server runtime | Next.js Node.js route handlers; Node-specific integrations include MongoDB, Nodemailer, crypto and PDF/Excel libraries |
| Persistence | MongoDB Node driver `mongodb ^6.17.0`; Mongoose `^8.18.0` for landlord payment config |
| Package management | `pnpm@10.15.1`; both `pnpm-lock.yaml` and `package-lock.json` are committed |
| Tests | Vitest; a separate Vitest config includes `src/e2e/**/*.e2e.test.ts` |
| Native packaging | Capacitor 8, Android and iOS projects |
| Deployment config | Vercel build and cron configuration in `vercel.json` |

`package.json` defines `next dev`, `next build --webpack`, `next start`, lint and Vitest scripts. The repository does not define a separate custom backend server. Next route handlers and server-rendered components execute server-side in the Next deployment. Client components call JSON APIs through browser fetch/client helpers.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/app/` | App Router pages, layouts, loading/error states and API handlers |
| `src/app/api/` | 194 HTTP route-handler files grouped by domain |
| `src/components/` | Shared navigation, theme, auth, portal, native/mobile, Airbnb and error UI |
| `src/lib/` | Server/client utilities, integrations, business rules and data helpers |
| `src/models/` | Mongoose schema for `LandlordMpesa` (only formal model found) |
| `src/types/` | Shared TypeScript shapes for properties, tenants, payments, reports and related entities |
| `src/hooks/` | Authentication, permissions, account tier, CSRF, idle and Airbnb hooks |
| `src/cron/` | One invoice-expiration handler outside `src/app/api` |
| `src/e2e/` | CSRF end-to-end-style test |
| `src/test/` | Test alias for Next's `server-only` marker |
| `public/` | Static assets, manifest, branding and current public upload files |
| `android/`, `ios/` | Native Capacitor projects |
| `scripts/` | Financial consistency audit script and app asset scripts |
| `docs/` | Existing payment, deployment-readiness, performance and monitoring notes |
| root config | Next, TypeScript, Vitest, ESLint, Tailwind, Capacitor and Vercel setup |

## Layers and communication

1. **Presentation.** `src/app/**/page.tsx`, layouts, shared components and hooks. Dashboard route families include `/admin`, `/property-owner-dashboard`, `/tenant-dashboard`, `/airbnb-dashboard` and `/airbnb-tenant-dashboard`; public families include `/property-listings` and `/market-place`. UI route guards and navigation improve UX but do not by themselves secure data.
2. **Routing/request handling.** Next App Router maps files under `src/app/api/**/route.ts` to HTTP routes. `middleware.ts` delegates to `src/proxy.ts`. Next rewrites one Chrome DevTools path to `/api/devtools-config`.
3. **Authentication and authorization.** `src/lib/session.ts` signs/verifies HS256 JWT sessions; `src/proxy.ts` maps roles and applies CSRF/rate limiting to configured requests. API handlers often repeat their own session, owner, team-member, or admin checks. See [Security audit](SECURITY_AUDIT.md).
4. **Application/domain logic.** `src/lib/` contains payment allocation/posting, rent overrides, invoice calculations, reporting, billing, referrals, Airbnb booking workflow, messaging and integrations. Some API routes call these services; many also embed business logic.
5. **Persistence.** `src/lib/mongodb.ts` manages a cached native client and selects `rentaldb`; `src/lib/mongoose.ts` manages Mongoose. Collections are created/used directly and are not comprehensively represented as typed models.
6. **Integration.** Provider helpers make outbound HTTP requests and receive webhooks through API handlers. Email, SMS, OAuth, payments and blob storage have independent environment/configuration requirements.
7. **Operations.** Vercel build/cron config, runtime logging/error reporting, native app shells and deployment environment variables.

## Representative request lifecycle

```mermaid
sequenceDiagram
  participant U as Browser or Capacitor webview
  participant N as Next.js middleware/proxy
  participant R as App Router handler
  participant S as Shared lib service
  participant D as MongoDB
  U->>N: HTTP request + cookies
  N->>N: Verify signed session; map role; apply route policy
  N->>N: For guarded mutations, check CSRF; apply process-local API limit
  N->>R: Forward request + derived identity headers/cookies
  R->>R: Validate payload and enforce handler-specific ownership
  R->>S: Call domain service when implemented
  S->>D: Read/write application collections
  D-->>S: Documents / write result
  S-->>R: Domain result
  R-->>U: JSON, redirect, file/PDF or page response
```

The proxy only applies to configured `matcher` paths. The 194 API handlers include routes outside the explicit `routeAccessMap`; those handlers must be reviewed individually for their own authorization. The matcher and route map are not a universal centralized policy engine.

## Frontend state and rendering

The code uses React state/hooks and browser fetch calls; Chart.js, Recharts, Zustand, and `react-hot-toast` are dependencies. This establishes availability, not use by every module. No global server cache or uniform query/cache library was identified in the inspected configuration. Loading states appear on public listing and admin paths, and global/root error components exist. An end-to-end accessibility or responsive audit was not performed.

## Error handling and observability

`src/lib/logger.ts` selects Winston in Node contexts and console fallback for edge contexts; Winston config sends JSON to console and an `error.log` file at error level. `src/lib/system-error-monitor.ts` stores grouped errors in `systemErrorLogs`, sanitizes sensitive-looking keys, and can send threshold/cooldown-limited email alerts. `src/instrumentation.ts`, `src/components/GlobalErrorMonitor.tsx`, and `src/app/global-error.tsx` provide server/browser/root error capture. Whether local file logging persists in serverless deployment is unverified.

## Important source entry points

- `src/app/layout.tsx` — root layout and shared providers.
- `src/app/page.tsx` — home route.
- `middleware.ts`, `src/proxy.ts` — request proxy, session-derived role checks, CSRF and throttling.
- `src/lib/session.ts`, `src/lib/auth.ts`, `src/lib/admin-auth.ts` — session and admin helper implementations.
- `src/lib/mongodb.ts`, `src/lib/mongoose.ts`, `src/lib/db-indexes.ts` — database connection and production indexes.
- `src/lib/verified-payment-posting.ts`, `src/lib/tenant-payment-allocation.ts`, `src/lib/financial-ledger.ts` — common financial posting components.
- `src/instrumentation.ts`, `src/lib/system-error-monitor.ts` — error capture.
