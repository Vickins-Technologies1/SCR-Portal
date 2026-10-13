# Deployment and operations

## Repository-backed deployment facts

| Area | Verified configuration | Operational status |
| --- | --- | --- |
| Hosting configuration | `vercel.json` sets `pnpm install`, `pnpm run build`, and three cron schedules | Vercel project, domain, runtime and current deploy not inspected |
| Build | `next build --webpack`; `next start` for standalone Next startup | Build outcome is not asserted by this audit |
| Database | `MONGODB_URI`; native helper selects database `rentaldb`; Mongoose connection uses same DB name | Vendor, cluster, network policy and backups unverified |
| Web origin | `capacitor.config.ts` points native shell to `https://www.myaccuraterent.com` and allows the root/subdomain | DNS, TLS and current site health unverified |
| Mobile | Capacitor 8, app ID `com.soranapropertymanagers.app`, Android and iOS projects | Signing, store release and push credentials unverified |
| Cron | Invoice renewal daily at 00:00; payment and invoice reminders daily at 06:00 (Vercel schedule timezone semantics apply) | Trigger success and timezone expectations unverified |
| File storage | `@vercel/blob` dependency and image remote pattern for Vercel Blob | Upload route config, token scope and current bucket unverified |

## Environment variable groups

The committed `.env.example` was read only as names; secret values were not inspected or copied. It documents these groups:

- Database and session: `MONGODB_URI` and `JWT_SECRET` are required by runtime code (`src/lib/mongodb.ts`, `src/lib/session.ts`), but neither name appears in the committed `.env.example` inspected here. They must be supplied through deployment configuration.
- Daraja: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_SHORTCODE`, `MPESA_ENVIRONMENT`, `MPESA_CALLBACK_BASE_URL`, `MPESA_ENCRYPTION_SECRET`.
- KopoKopo: `KOPOKOPO_ENVIRONMENT`, OAuth/API base URLs, client ID/secret, API key, callback base URL and till/passkey variables.
- Google OAuth web configuration and redirect URI.
- Tuma callback configuration and owner integration credentials.
- Referral and lifetime product configuration.
- SMTP and error alert configuration, including internal error monitor key.
- Optional performance profiling flags and thresholds are read by code, though they are not listed in `.env.example`.

`.env.local` exists in the workspace but was deliberately not read; `.gitignore` excludes `.env*` except `.env.example`. The example is therefore not a complete environment manifest: it omits at least the required database URI and session signing key. The actual production environment, secret manager, variable values, scopes, rotation and preview/production separation are unverified.

## Scheduled processing

`vercel.json` schedules `/api/cron/renew-invoices` daily at `0 0 * * *`, and payment/invoice reminders at `0 6 * * *`. The implementation also includes `/api/cron/airbnb-reminders` without an entry in the inspected Vercel cron list. Invoice renewal delegates to `src/cron/check-expired-invoices/route.ts`; reminder routes delegate to `reminders.ts` and `invoice-reminders.ts`. These are synchronous HTTP handlers, not independent worker processes. See SEC-01 in [Security audit](SECURITY_AUDIT.md).

## Logging and monitoring

Runtime logs use Winston/console. Opt-in performance logging records route timing/response size and Mongo command timing metadata when `SORANA_PERFORMANCE_PROFILING=true`. System error capture persists fingerprinted error records to `systemErrorLogs`; email alerts are environment/threshold/cooldown controlled. No external tracing, metrics backend, uptime checks, on-call configuration, alert delivery SLA or durable serverless filesystem was verified.

## Deployment and recovery unknowns

No checked-in CI workflow, infrastructure-as-code, database migration workflow, backup schedule, point-in-time recovery procedure, rollback instructions, staging parity contract, region selection, autoscaling configuration or disaster-recovery plan was found in the inspected top-level project configuration. Vercel deployment configuration alone does not establish that these are absent in the hosting account; operator review is needed.

## Operational readiness checks for deployment owners

- Confirm Vercel project, production/preview environment variables, domain, build output and rollback method.
- Protect cron endpoints with a handler-verified secret and confirm schedules/timezone.
- Confirm MongoDB backups, restore drills, index bootstrap completion and least-privilege credentials.
- Register provider callbacks against the deployed HTTPS origin and test only with provider sandbox accounts.
- Confirm Blob upload authorization, retention and public/private access expectations.
- Confirm mobile app signing, store distribution, push configuration and supported origin.
- Establish log retention and redact sensitive fields before broadening production telemetry.
