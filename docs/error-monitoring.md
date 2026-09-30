# Sorana error monitoring

Sorana captures uncaught server request errors through `src/instrumentation.ts`, browser exceptions and unhandled promise rejections through `GlobalErrorMonitor`, and React root failures through `src/app/global-error.tsx`. Events are sanitized and stored in MongoDB’s `systemErrorLogs` collection. Identical errors are grouped by name, message, endpoint, method and status. The first event alerts immediately; repeat alerts are limited by `ERROR_ALERT_REPEAT_THRESHOLD` and `ERROR_ALERT_COOLDOWN_MS`.

Set the existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, and `SMTP_PASS` variables and enable alerts only in production. The committed `.env.example` is ready to copy into the deployment environment; replace its SMTP placeholders and internal monitor key with real values. Email failures are recorded and never change the application response. Passwords, tokens, cookies, authorization values, API keys, secrets, OTPs and payment credentials are redacted. Administrators with dashboard access can use **Admin → System Errors** to search, inspect errors, and mark them resolved or reopen them.

Run `pnpm test`, `pnpm lint`, `pnpm exec tsc --noEmit`, and `pnpm build`. Test a real alert only with intentionally configured production-like SMTP credentials.
