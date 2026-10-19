# Authentication Turnstile policy

## Experience

Public password authentication and recovery actions use the shared explicit-render `TurnstileField`. It loads Cloudflare's official Turnstile script once per page, renders one widget for the active form, and uses the managed widget configured with `appearance: "interaction-only"`. Cloudflare can issue a token without showing an interactive control when its managed assessment does not require a challenge. It can show an interactive challenge when Cloudflare decides one is needed. Seeing no checkbox is therefore expected after successful automatic verification; it is not evidence that the backend skipped verification.

The client treats a token as a one-use value. It clears tokens on expiry and after form attempts. Script load, API initialization, unsupported-browser, widget error, and timeout cases are surfaced with a retry path. A client callback only supplies a candidate token; protected handlers always validate it server-side.

## Protected actions

| Action | Page or flow | Server endpoint | Siteverify action |
| --- | --- | --- | --- |
| Password login | Tenant / guest, owner, admin, biometric and PIN password login | `/api/signin`, `/api/admin/login` | `login` |
| Account creation | `/sign-up` | `/api/signup` | `signup` |
| Password reset request | Tenant and owner portal reset forms | `/api/tenant/reset-password-request`, `/api/owner/reset-password-request` | `password_reset_request` |
| Password reset | `/reset-password` | `/api/tenant/reset-password`, `/api/owner/reset-password` | `password_reset` |
| OTP verify / resend | Admin and owner portals, Google phone completion | `/api/auth/otp/verify`, `/api/auth/otp/resend` | `otp_verify`, `otp_resend` |
| Complete Google phone setup | `/complete-phone` | `/api/auth/google/complete-phone` | `google_auth` |

Google OAuth start/callback and native Google ID-token exchange use the provider's signed identity proof, state, nonce, and redirect validation. They are not HTML forms accepting a user-supplied password, OTP, or account-creation payload; the callback must retain its OAuth protections rather than require a browser Turnstile token. Google phone completion and its subsequent OTP actions are protected as listed above. Authenticated password changes are session-authenticated and CSRF-protected rather than public password-reset requests.

`requireTurnstile` is the shared server gate for the public actions above. It rejects absent and oversized tokens, fails closed if the secret/production hostname allowlist/rate-limit service is unavailable, sends tokens to Cloudflare Siteverify, and requires success, the expected action, and an explicitly configured hostname. Cloudflare enforces the single-use/expiry property and reports expired or reused tokens as `timeout-or-duplicate`; a failed Siteverify result is rejected.

## Deployment configuration

- `NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY` must be the public sitekey paired with the server-side `CLOUDFLARE_TURNSTILE_SECRET_KEY`.
- Production must set `TURNSTILE_EXPECTED_HOSTNAMES` to an explicit comma-separated allowlist containing every configured canonical hostname, normally `myaccuraterent.com,www.myaccuraterent.com` if both serve the application. The verifier does not infer production hostnames from an incoming `Host` header.
- Production must also configure `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; auth endpoints fail closed if their shared rate limiter is unavailable.
- Use separate Turnstile widgets/keys for local, preview/staging, and production where possible. The linked Vercel project currently has the Turnstile and Upstash variables only in Production; they are absent from Preview and Development. Those environments therefore fail closed and cannot render a working widget until their own test/staging configuration is added. Do not copy the production secret into previews.
- The checked-in `.env.example` documents the required variable names. No secret or production deployment setting was available in this checkout to confirm the dashboard key pairing, allowed-hostname list, or Vercel environment values.

Cloudflare dashboard and deployment environment verification remains an operational check. Review Turnstile analytics and the browser console/network panel after deployment, on both root and `www` hostnames, and confirm Siteverify reports the matching hostname and action.
