# Authentication rate limiting

Public authentication routes use shared Upstash Redis rate limits keyed by action, trusted edge IP, and a hashed account identifier where the request provides one. Limits use a 15-minute fixed window:

| Action | Attempts per key |
| --- | ---: |
| Login | 20 |
| Signup | 5 |
| Password reset request | 5 |
| Password reset completion | 10 |
| OTP verification | 10 |
| OTP resend | 5 |
| Google phone completion | 8 |

Production must set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. If the shared store is unavailable, protected auth routes fail closed. Local development uses process-local counters when those credentials are absent.

The rate limit is separate from login credentials, OTP validation, CSRF checks, signed OAuth state and tokens, and session validation; those checks remain in their respective flows.
