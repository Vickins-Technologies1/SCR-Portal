# Cloudflare authentication protection

## Authentication entry points found

| Purpose | Page(s) | API |
| --- | --- | --- |
| Owner / team login | `/`, `/portals/owner` | `POST /api/signin` |
| Tenant / Airbnb guest login | `/tenant-login`, `/airbnb-tenant-login` | `POST /api/signin` |
| Administrator login and OTP | `/admin/login` | `POST /api/admin/login`, `POST /api/auth/otp/verify`, `POST /api/auth/otp/resend` |
| Account creation | `/sign-up` | `POST /api/signup` |
| Forgot password | Owner and tenant login dialogs | `POST /api/owner/reset-password-request`, `POST /api/tenant/reset-password-request` |
| Password reset | `/reset-password` | `POST /api/owner/reset-password`, `POST /api/tenant/reset-password` |
| Google OAuth | Login and signup pages | `GET/POST /api/auth/google`, callback, `POST /api/auth/google/complete-phone` |

Google callbacks are server-to-server/browser redirects with state/nonce or Google ID-token validation and must not be blocked by interactive CAPTCHA or edge challenges. OAuth initiation is currently not protected by Turnstile. OTP challenges are issued by the password-login handlers and verified through the shared OTP APIs.

## Code protection implemented

The login, signup, password-reset request, password-reset completion, OTP verify, and OTP resend APIs call `requireTurnstile` before protected work. Verification posts to Cloudflare Siteverify with a five-second timeout and rejects absent tokens, unsuccessful responses, wrong actions, wrong hostnames, timeouts, and missing production configuration. Verification errors are returned as generic retry messages; provider details are not exposed. Forms use the official explicit Turnstile widget in interaction-only appearance and submit its token with each action. Existing CSRF checks and account recovery's generic response remain in place.

The protected APIs also use shared Upstash Redis rate limits by action and hashed account identifier, alongside the trusted edge IP. Production fails closed if the Upstash REST credentials are missing or unavailable. Local development falls back to process-local counters. The earlier in-memory signup/reset and proxy counters still exist and are not distributed.

## Environment setup

Set these in local `.env.local` and the Vercel project environment (Production, Preview, and Development as appropriate):

- `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY`: public site key from the Turnstile widget.
- `CLOUDFLARE_TURNSTILE_SECRET_KEY`: secret key from that same widget; server only.
- `TURNSTILE_EXPECTED_HOSTNAMES`: comma-separated exact hostnames accepted from Siteverify, such as `myaccuraterent.com,www.myaccuraterent.com`. Include specific preview/local hostnames only in non-production environments that need them.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: shared Upstash Redis REST credentials for production auth rate limiting.

The example file contains blank values. Missing site key prevents widget use; missing secret, production hostname allowlist, or Upstash credentials makes protected API requests fail closed. Never set a fake verification response or production bypass.

## Cloudflare dashboard actions still required

These actions were not performed from the repository:

1. In Cloudflare Dashboard → Turnstile, create a widget for `myaccuraterent.com` and `www.myaccuraterent.com`; copy its site and secret keys into Vercel and local secrets storage.
2. Keep the public website hostname proxied through Cloudflare (orange cloud) and verify its DNS target is the current Vercel deployment. Do not change origin DNS until the active Vercel domain configuration is confirmed.
3. Under Security → WAF, enable Cloudflare Managed Rules and add rate limiting for `POST /api/signin` and `/api/admin/login` (starting policy: 10 requests per IP per 10 minutes), `POST /api/signup` (5 per IP per 10 minutes), password reset request routes (5 per IP per 15 minutes), and OTP resend/verify routes (5 resends and 10 verifies per IP per 10 minutes). Tune using legitimate traffic and use application/account identifiers where supported; these are starting values, not verified traffic thresholds.
4. Exclude OAuth callback, payment webhook, and provider callback paths from browser challenges. Keep their existing state, token, or signature checks.
5. Enforce HTTPS with Cloudflare SSL/TLS Full (strict) after confirming the origin certificate. Enable Always Use HTTPS and appropriate HSTS only after confirming every hostname/subdomain is HTTPS-ready.
6. Restrict direct origin access to Cloudflare where the hosting provider supports it. For Vercel, verify the project's domain and deployment protection settings; do not invent firewall rules or block Vercel health checks.
7. Review Security Events after rollout and tune rules for false positives. Cloudflare plan availability and rule syntax vary by plan.

Cloudflare dashboard, DNS/proxy, origin restriction, and production activation remain administrator/deployment tasks. This code change alone does not mean protection is active in production.
