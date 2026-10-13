# Architectural risks and remediation roadmap

Priorities reflect likely business impact and source evidence. These items are recommendations; no application change was made in this audit.

| Priority | Risk | Evidence and impact | Recommended direction |
| --- | --- | --- | --- |
| P0 | Publicly triggerable scheduled operations | Cron GET handlers perform invoice renewal and notification work; no handler-level secret check was found, and unmatched proxy paths pass through. Could allow unauthorized repeated job execution if externally reachable. | Add authenticated job invocation, idempotent job keys/locks, and unauthenticated-request tests. |
| P0 | Payment posting still spans multiple writes | Shared `postVerifiedPayment()` improves amount, identity, duplicate and claim checks, but tenant allocation, invoice reconciliation, ledger insert, wallet events and final payment marker are not one database transaction/outbox. Partial failure can leave projections/claims inconsistent until retry/recovery. | Use Mongo transactions where topology supports them or a durable event/outbox plus retryable projections and reconciliation monitor. |
| P1 | Webhook authenticity varies | Stripe/KopoKopo signatures are checked; Daraja/Tuma signature checks were not observed in inspected handlers. | Add supported signature/secret/network controls, freshness checks and provider-specific replay tests. |
| P1 | Admin permission feature matching is broader than permission names | `adminPermissionsCover()` compares feature key, so view and manage permission within one feature may satisfy each other. | Exact matching or explicit permission hierarchy; test every sensitive admin action. |
| P1 | API authorization is distributed and default allow at proxy | Role map covers selected routes; unmatched routes forward to handlers. Correctness depends on each route’s local check and resource filters. | Adopt default-deny for APIs and explicit public route declarations; automate route auth metadata review. |
| P1 | Multiple financial read paths can disagree | Shared reversal-aware projection exists, while owner stats/charts and older screens may aggregate raw payment/category fields. | Route all financial statements and dashboards through shared report projections; reconcile sampled outputs. |
| P1 | Owner/team permission granularity varies | Permission model and hooks exist, but access checks are not uniform across route handlers. | Centralize `actor -> owner -> resource -> action` authorization and add owner/team cross-boundary tests. |
| P2 | Mixed persistence abstraction and schema drift | One Mongoose model versus broad direct Mongo collection use; string/ObjectId and status legacy compatibility visible. | Gradually define collection contracts and shared repositories/validators; add safe schema/legacy-data reports before migration. |
| P2 | Currency and timezone policy not fully uniform | JS-number/cents rounding, integer STK amounts and utility rounding coexist; dates use Date/string/provider local time in different helpers. | Standardize money units and Africa/Nairobi business period conversion at ingestion and reporting boundaries. |
| P2 | Operational recovery is not documented/configured in repo | No visible backup/restore, deployment rollback, CI workflow or outbox/worker configuration; cloud configuration may exist elsewhere. | Document and test restore/rollback; define CI gates; maintain operational dashboards and incident procedures. |
| P2 | Environment example omits required runtime variables | `MONGODB_URI` and `JWT_SECRET` are required by database/session code but absent from `.env.example`, making the checked-in setup guide incomplete. | Maintain a complete variable-name manifest with safe placeholders, purpose, runtime/build scope and required/optional status. |
| P2 | Sensitive data reaches logs | SMS logger records recipient and full message; OTP sender includes code in the message body. | Redact message and mask recipient, then review logging access and retention. |
| P3 | Large modular monolith has uneven boundaries | Route handlers sometimes combine access checks, validation, persistence, notifications and business rules; integrations follow similar direct patterns. | Extract stable application services by domain as future changes require, starting with payment posting and authorization. |

## Suggested remediation sequence

1. Protect cron execution and remove OTP/body logging; these can be handled with narrow security changes.
2. Correct admin permission matching and audit every mutating admin route against required grants.
3. Establish callback authenticity controls and a provider-neutral durable event/retry protocol.
4. Make financial side effects transactionally safe or outbox-driven; add concurrency and reconciliation tests.
5. Default-deny API route access and centralize tenant/owner/resource checks.
6. Unify financial read models, currency precision and business timezone semantics.
7. Add CI, production recovery runbooks, database restore evidence and measured operational monitoring.

Effort, deployment risk and ordering should be confirmed with the maintainers and current infrastructure owner before implementation.
