# Security audit

## Scope

Static defensive review of checked-out source and configuration. No exploit testing, live account inspection, provider traffic or dependency audit command was run. Severity reflects source evidence and likely impact; production exposure and compensating controls may change practical risk.

## Security controls observed

- Session token uses JOSE JWT with HS256, seven-day default expiry, `HttpOnly`, `SameSite=Lax`, `Secure` in production; secret read from `JWT_SECRET` (`src/lib/session.ts`).
- Proxy verifies the signed token before deriving role/user/owner cookies for matched requests; checks selected role routes and suspended owner status.
- CSRF token cookie/header equality is enforced for most mapped mutating API routes; several routes self-handle or are exempt.
- Zod schema validation is used for Daraja callbacks, C2B confirmation and selected payment routes.
- KopoKopo verifies an HMAC webhook signature; Stripe verifies timestamped HMAC using constant-time comparison.
- `postVerifiedPayment()` requires provider-confirmed amount for Daraja/Tuma/KopoKopo, quarantines requested/confirmed mismatch, checks tenant/property and optional landlord/property owner linkage, checks provider duplicate identity, and uses a conditional processing claim.
- Error-monitor metadata redaction includes password/token/secret/cookie/API-key/payment key names.
- `.env*` is gitignored except `.env.example`; no secret values are included in this document.

## Findings

### SEC-01 — High: scheduled operations have no handler-level authorization

**Affected:** invoice renewal and reminder cron handlers. **Evidence:** `src/app/api/cron/renew-invoices/route.ts:5`, `send-payment-reminders/route.ts:5`, `send-invoice-reminders/route.ts:4`, and `airbnb-reminders/route.ts:9` expose `GET`; the inspected handlers do not check a cron bearer secret. `vercel.json` declares schedules for renewal and two reminder paths. In `src/proxy.ts:344`, an API route with no matching role-map rule falls through to `nextWithAuth()`; cron paths have no role-map entry. The proxy rate limiter applies only to mutating methods, so these GET jobs do not get that limiter.

**Impact/preconditions:** if the Vercel URL is publicly reachable without an external access rule, an unauthenticated caller may trigger bulk invoice renewal and/or reminder email/SMS work; repeated requests can create duplicate work or provider costs depending on job idempotency. Live deployment protections are unknown.

**Recommendation:** require a server-verified cron secret or equivalent platform-authenticated invocation inside each handler, add job-level idempotency/locking, and test unauthenticated requests return 401/403. **Verified code issue; deployed exploitability unverified.**

### SEC-02 — High: SMS logs can include OTP message content and recipient

**Affected:** `src/lib/sms.ts:140-143` and `sendOtpSms()` near line 261. The provider request and success/failure logs include recipient and `message`; `sendOtpSms()` constructs the message containing the verification code and delegates to that sender. Thus the source passes OTP content into normal application logs.

**Impact/preconditions:** anyone with access to retained runtime logs may see phone numbers and active/recent OTP codes. Actual log access, retention and whether provider responses redact content are unverified.

**Recommendation:** log delivery metadata only (provider, request ID, status, masked recipient); never log OTP body or full SMS payload; review existing log retention/access.

### SEC-03 — Medium: admin permission checks collapse actions within a feature

**Affected:** `src/lib/admin-permissions.ts:288-291`. `adminPermissionsCover()` compares `admin:feature` and treats any permission in that feature group as covering a required permission. A grant such as `admin:payments:view` can therefore satisfy a check for `admin:payments:manage` when callers use this helper.

**Impact/preconditions:** a restricted admin-team member may receive a more powerful action within a feature than the permission label/preset suggests. Exploitability depends on route calls to `requireAdmin()` and the required permission; review each admin mutation.

**Recommendation:** exact permission matching or explicit hierarchical grants; add route-level tests that view-only roles cannot mutate. **Verified helper behavior; route exposure varies.**

### SEC-04 — Medium: webhook authentication is not uniform

**Affected:** Daraja callbacks and Tuma webhook. KopoKopo and Stripe verify signatures in the inspected handlers. Daraja handlers validate payload and correlate provider IDs/claim callbacks but no signature verification was found. The Tuma webhook route did not show an equivalent signature check before parsing/matching. Shared posting mitigates some financial consequences but is not a substitute for authenticating event origin.

**Impact/preconditions:** if callback IDs or payment references can be guessed/obtained and the endpoint is publicly reachable, spoofed or replayed requests may consume resources or alter provider state; posting checks and provider matching lower impact. Provider IP allowlists or other external controls are unverified.

**Recommendation:** verify provider-supported signatures/secrets or authenticated transport, add freshness/replay controls, and keep idempotent event records. **Absence in inspected handlers verified; exploit path unverified.**

### SEC-05 — Medium: API role gate has allow-through behavior for unmapped routes

**Affected:** `src/proxy.ts:321-345` route map and all API routes. The proxy explicitly comments that no rule means allow and forwards unmatched routes. There are 194 route handlers, far more than the explicit route entries; some handlers correctly enforce auth themselves, but no central invariant ensures each new endpoint does.

**Impact/preconditions:** an API route that lacks its own auth/ownership check could become publicly callable when added or refactored. This finding is a systemic control gap, not a claim that every unmapped endpoint is vulnerable.

**Recommendation:** default-deny API paths or maintain an explicit public-route allowlist; add a static test/CI check that every route declares its auth class. **Fallback behavior verified; vulnerable endpoint not asserted.**

### SEC-06 — Low: in-memory rate limiting is per runtime instance and only on some mutations

**Affected:** `src/proxy.ts`. A `Map` tracks IP counts in process memory; it is applied to selected non-admin mutating mapped API requests. Serverless instances do not share this state, reads are not covered, and admin APIs are exempt.

**Impact:** it does not provide a global abuse ceiling or reliable account/provider throttling under scaling/restarts. Upstash dependencies exist but a universal limiter integration was not established.

**Recommendation:** use a shared limiter for exposed auth, payment initiation, upload and callback-sensitive paths, with per-user/provider keys and explicit exemptions.

### SEC-07 — Informational: security coverage depends on mixed identity conventions

**Affected:** route handlers and owner/team/tenant collections. Proxy role authorization is broad; exact ownership checks are performed in individual handlers. Database references may be strings or ObjectIds. Shared payment posting enforces tenant/property equality for tenant-linked records, but this is not a database-level constraint across all domains.

**Recommendation:** centralize actor/owner/resource checks and standardize identity representation; maintain cross-owner and cross-property authorization tests.

## Areas not verified

No dependency vulnerability audit was run. No live secrets were read. TLS, Mongo network policy, encryption at rest, CSP/security headers, production CORS, account lockout, password reset entropy/expiry, upload content validation, log retention, backup security, provider signature support, and Vercel access controls require operational review. This is not a penetration test or formal compliance assessment.
