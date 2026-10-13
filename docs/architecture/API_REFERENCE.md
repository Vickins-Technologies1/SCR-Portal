# API reference

## Conventions and limits

The source contains 194 `src/app/api/**/route.ts` handlers. Next maps each folder path to an HTTP endpoint; bracketed folders are dynamic segments. HTTP verbs are the named exports in each handler. Authentication and request/response behavior are not uniform: `middleware.ts` delegates to `src/proxy.ts`, which applies role rules only when a path matches `routeAccessMap`; unmatched API paths pass through to the handler. Many handlers perform their own validation and ownership checks. The route inventory below is a locator, not a tested OpenAPI contract.

Common behavior: JSON handlers generally return `{success, message, ...}` or provider-specific shapes; exact fields and status codes are defined in each linked route file. Zod is used for selected security-sensitive/payment payloads; other routes use manual validation. CSRF is usually enforced by the proxy on mutating mapped APIs, with explicit self-handled and exempt exceptions. No universal pagination, response envelope, API version prefix, or rate limiter applies to all routes.

## Authentication and mutation policy

- Browser sessions use the signed `session` cookie; owner/team/tenant and admin handlers often additionally check derived `userId` and `role` cookies, a signed session, or database ownership.
- `src/proxy.ts` has a role map for selected APIs and portal routes. No matching entry means it forwards the request; handler enforcement is then decisive.
- CSRF check compares CSRF cookie and `x-csrf-token` for most non-GET requests passing through the mapped API path. A small set of routes are exempt or self-handled.
- Process-local in-memory limiting is applied to non-admin mutating mapped API requests; it is not a distributed per-account control.
- Provider callbacks authenticate differently: KopoKopo/Stripe signatures are verified; Daraja uses schema, correlation and claim logic; Tuma signature verification was not observed.

## Verified route inventory by domain

For exact schemas, response fields, and branch-specific status codes, follow the route file shown. This list captures endpoint locations found in source and the exported methods; dynamic identifiers are written `{name}`.

### Authentication, account and access

| Methods | Endpoint | Handler |
| --- | --- | --- |
| POST | `/api/signup`, `/api/signin`, `/api/signout` | `src/app/api/signup/route.ts`, `signin/route.ts`, `signout/route.ts` |
| GET, POST | `/api/auth/google` | `src/app/api/auth/google/route.ts` |
| GET | `/api/auth/google/config`, `/api/auth/google/callback` | `src/app/api/auth/google/config/route.ts`, `callback/route.ts` |
| POST | `/api/auth/google/complete-phone`, `/api/auth/otp/verify`, `/api/auth/otp/resend` | `src/app/api/auth/google/complete-phone/route.ts`, `auth/otp/**` |
| GET | `/api/auth/session`, `/api/csrf-token`, `/api/user`, `/api/property-owner-data`, `/api/account/entitlements` | `src/app/api/auth/session/route.ts`, `csrf-token/route.ts`, `user/route.ts`, `property-owner-data/route.ts`, `account/entitlements/route.ts` |
| POST | `/api/tenant/reset-password-request`, `/api/tenant/reset-password`, `/api/owner/reset-password-request`, `/api/owner/reset-password`, `/api/tenant/change-password` | Corresponding `src/app/api/{tenant,owner}/.../route.ts` handlers |
| POST | `/api/impersonate`, `/api/revert-impersonation`, `/api/admin/impersonate-owner`, `/api/admin/revert-impersonation` | Corresponding `src/app/api/**/route.ts` handlers |
| GET, POST | `/api/team-members`, `/api/admin/team-members`; GET/POST at individual admin/member paths vary | `src/app/api/team-members/**`, `admin/team-members/**` |

### Properties, tenants and utilities

| Methods | Endpoint families | Handler/source |
| --- | --- | --- |
| GET, POST | `/api/properties`; `/api/properties/{propertyId}` | `src/app/api/properties/route.ts`, `[propertyId]/route.ts` |
| GET, POST | `/api/tenants`; `/api/tenants/{tenantId}` (GET/PATCH) | `src/app/api/tenants/route.ts`, `[tenantId]/route.ts` |
| GET, POST | `/api/tenants/vacate`, `/api/tenants/maintenance`, `/api/tenants/check-dues` | Corresponding `src/app/api/tenants/**/route.ts` |
| GET, POST, PATCH | `/api/tenants/maintenance/{id}` methods are route-specific | `src/app/api/tenants/maintenance/[id]/route.ts` |
| POST | `/api/tenants/resend-welcome`; GET/POST `/api/property-owners/vacate`; GET/PATCH `/api/property-owners/tenant-deletions`; GET `/api/property-owners/maintenance` | Corresponding route files |
| GET, POST, PUT, DELETE | `/api/list-properties`; GET/POST `/api/rent-price-overrides`; `/api/tenants/{tenantId}/rent-overrides` and `/{overrideId}` | Corresponding route files |
| GET, POST | `/api/utility-charges`; GET/PATCH/DELETE `/api/utility-charges/{id}` | `src/app/api/utility-charges/**/route.ts` |
| GET | `/api/ownerstats`, `/api/ownercharts`, `/api/owner-dues`, `/api/property-charts`, `/api/fix-property-units` | Corresponding route files |

### Payments, invoices and finance

| Methods | Endpoint families | Handler/source |
| --- | --- | --- |
| GET, POST | `/api/payments`; GET/DELETE or other route-specific methods `/api/payments/{paymentId}`; `/api/payments/{paymentId}/reverse`; POST `/api/payments/excel` | `src/app/api/payments/**/route.ts` |
| GET, POST | `/api/tenant/payments`; POST `/api/tenant/payments/manual`, `/check-status`, `/update-fields`; GET `/api/tenant/payments/receipt` | `src/app/api/tenant/payments/**/route.ts` |
| POST | `/api/mpesa/stk-push`, `/api/transaction-status`, `/api/tenant/payments/check-status` | Corresponding route files |
| GET, POST | `/api/invoices`; POST `/api/invoices/generate`, `/api/invoices/excel`; GET `/api/invoices/estimate`; PATCH `/api/invoices/update-status` | `src/app/api/invoices/**/route.ts` |
| GET | `/api/reports`, `/api/pending-invoices`; GET/POST `/api/expenses` | Corresponding route files |
| POST | `/api/update-wallet`, `/api/generate-excel` | Corresponding route files |
| GET | `/api/admin/payments`, `/api/admin/payments/reconciliation`, `/api/admin/owner-payments`, `/api/admin/invoices` | Corresponding admin route files |
| POST | `/api/admin/invoices/send-email`; GET/PUT `/api/admin/invoice-payment-provider` | Corresponding admin route files |

### Payment providers and callbacks

| Methods | Endpoint | Purpose established by source |
| --- | --- | --- |
| POST | `/api/mpesa/stk-callback` | Daraja STK callback; schema validation, correlation and posting |
| POST | `/api/mpesa/c2b-validation`, `/api/mpesa/c2b-confirmation`, `/api/mpesa/c2b-register` | Daraja C2B validation, confirmation and URL registration |
| GET | `/api/mpesa/shortcode` | Shortcode/account-related lookup |
| GET, POST | `/api/mpesa/connect` | Owner Daraja connection operations |
| GET, PUT, DELETE | `/api/owner/daraja` | Owner Daraja settings |
| POST | `/api/owner/daraja/stk-push`, `/status`, `/callback` | Owner payment initiation, status and callback |
| POST | `/api/owner/invoice-payments/daraja-stk-push`, `/daraja-status`, `/daraja-callback` | Owner invoice-payment flow |
| POST | `/api/kopokopo/webhook`, `/api/tuma/webhook`, `/api/stripe/webhook` | Provider callbacks; provider-specific verification |
| GET | `/api/admin/tuma/webhooks` | Admin webhook inspection |
| GET, PUT | `/api/owner/payment-settings`; GET/PUT/DELETE `/api/owner/integrations` | Owner payment and integration configuration |
| GET, POST | `/api/owner/tuma/business`, `/api/owner/tuma/banks`; Airbnb Tuma equivalents under `/api/airbnb/tuma/**` | Tuma business/bank configuration APIs |

### Airbnb / short-stay

Verified route families include `/api/airbnb/overview`, `/integrations`, `/settings`, `/payment-gateway`, `/listings`, `/bookings`, `/calendar`, `/pricing`, `/operations`, `/operations/summary`, `/payments`, `/payments/collect`, `/payments/manual`, `/payments/verify`, `/payments/statement`, `/reports`, `/reports/pdf`, `/invoices/estimate`, `/invoices/refresh`, `/compliance`, `/compliance/summary`, `/messages`, `/messages/logs`, `/message-templates`, `/tenants/create`, and `/tuma/**`. The verbs vary by route and include GET, POST, PUT, PATCH and DELETE. See `src/app/api/airbnb/**/route.ts`.

Guest/short-stay tenant routes include `/api/airbnb-tenant/booking`, `/booking/receipt`, `/payments/stk-push`, `/payments/check-status`, `/messages`, `/documents`, and `/extend-stay`. See `src/app/api/airbnb-tenant/**/route.ts`.

### Admin, public, support, notifications and operations

| Domain | Endpoints located in source |
| --- | --- |
| Admin owners/properties/users | `/api/admin`, `/api/admin/users`, `/api/admin/users/{id}`, `/api/admin/property-owners`, `/api/admin/property-owners/{id}`, `/{id}/approve`, `/{id}/status`, `/api/admin/properties`, `/api/admin/properties/{id}`, `/api/admin/tenants` |
| Admin listings/reviews/settings | `/api/admin/market-place-sale-listings`, `/{id}`, `/api/admin/reviews`, `/api/admin/reviews/{id}`, `/api/admin/settings`, `/api/admin/lifetime`, `/api/admin/referrals`, `/api/admin/referrals/{id}`, `/api/admin/referrals/payouts/{id}`, `/api/admin/owner-notifications` |
| Admin Airbnb/support/errors | `/api/admin/airbnb/overview`, `/listings`, `/bookings`, `/messages`, `/integrations`, `/payouts`; `/api/admin/system-errors`; `/api/support/messages`, `/conversations`, `/presence`, `/upload` |
| Public listing/lead | `/api/public/properties`, `/api/public-properties`, `/api/public-properties/{id}`, `/api/public-properties/{id}/reviews`, `/api/public-bookings`, `/api/public/contact` |
| Notifications/activity | `/api/notifications`, `/api/notifications/reminders`, `/api/owner/activities`, `/api/devices/push-token` |
| System monitoring | `/api/system-errors/ingest`, `/api/system-errors/client` |
| Scheduled routes | GET `/api/cron/renew-invoices`, `/api/cron/send-payment-reminders`, `/api/cron/send-invoice-reminders`, `/api/cron/airbnb-reminders` |
| Billing/referrals | `/api/lifetime/plan`, `/api/lifetime/checkout`, `/api/lifetime/checkout/status`, `/api/referrals`, `/api/owner/tier` |

## Route contract verification

No generated OpenAPI schema is present. Some routes expose several verbs, and some dynamic routes use different authentication and validation logic by method. Treat the exact route source as canonical. Provider routes should be read together with `src/lib/{mpesa,daraja-callback,c2b,kopokopo,tuma,verified-payment-posting}.ts`; invoice/payment routes should be read with the financial services documented in [Financial engine](FINANCIAL_ENGINE.md).

## Complete route-file inventory

This is the complete set of 194 API route paths found under `src/app/api` at audit time. Methods shown were extracted from explicit `export function` / `export const` declarations; where none were detected, inspect that route file for its exported handler form. Parameter names are normalized from Next.js bracket segments.

```text
GET /api/account/entitlements
GET /api/admin/airbnb/bookings
GET /api/admin/airbnb/integrations
GET /api/admin/airbnb/listings
GET /api/admin/airbnb/messages
GET /api/admin/airbnb/overview
GET /api/admin/airbnb/payouts
POST /api/admin/impersonate-owner
GET,PUT /api/admin/invoice-payment-provider
GET /api/admin/invoices
POST /api/admin/invoices/send-email
GET,PATCH,POST /api/admin/lifetime
POST /api/admin/login
route-specific /api/admin/market-place-sale-listings/{id}
GET,POST /api/admin/market-place-sale-listings
GET,POST /api/admin/owner-notifications
GET /api/admin/owner-payments
GET /api/admin/payments/reconciliation
GET /api/admin/payments
route-specific /api/admin/properties/{id}
GET /api/admin/properties
route-specific /api/admin/property-owners/{id}/approve
route-specific /api/admin/property-owners/{id}
route-specific /api/admin/property-owners/{id}/status
GET,POST /api/admin/property-owners
route-specific /api/admin/referrals/{id}
route-specific /api/admin/referrals/payouts/{id}
GET,PATCH /api/admin/referrals
POST /api/admin/revert-impersonation
route-specific /api/admin/reviews/{id}
GET /api/admin/reviews
GET /api/admin
GET,PATCH /api/admin/settings
GET,PATCH /api/admin/system-errors
route-specific /api/admin/team-members/{id}
GET,POST /api/admin/team-members
GET /api/admin/tenants
GET /api/admin/tuma/webhooks
route-specific /api/admin/users/{id}
GET /api/admin/users
GET /api/airbnb-tenant/booking/receipt
GET /api/airbnb-tenant/booking
GET,POST /api/airbnb-tenant/documents
GET,POST /api/airbnb-tenant/extend-stay
GET,POST /api/airbnb-tenant/messages
POST /api/airbnb-tenant/payments/check-status
POST /api/airbnb-tenant/payments/stk-push
route-specific /api/airbnb/bookings/{bookingId}
DELETE,GET,POST /api/airbnb/bookings
GET,POST /api/airbnb/calendar
GET,POST /api/airbnb/compliance
GET /api/airbnb/compliance/summary
GET,POST /api/airbnb/integrations
GET /api/airbnb/invoices/estimate
POST /api/airbnb/invoices/refresh
DELETE,GET,POST,PUT /api/airbnb/listings
DELETE,GET,POST,PUT /api/airbnb/message-templates
GET /api/airbnb/messages/logs
GET,POST /api/airbnb/messages
GET,PATCH,POST /api/airbnb/operations
GET /api/airbnb/operations/summary
GET /api/airbnb/overview
GET,PUT /api/airbnb/payment-gateway
POST /api/airbnb/payments/collect
POST /api/airbnb/payments/manual
GET /api/airbnb/payments
GET /api/airbnb/payments/statement
POST /api/airbnb/payments/verify
GET,POST /api/airbnb/pricing
GET /api/airbnb/reports/pdf
GET /api/airbnb/reports
GET,PUT /api/airbnb/settings
POST /api/airbnb/tenants/create
GET /api/airbnb/tuma/banks
POST /api/airbnb/tuma/business
DELETE,GET,PUT /api/airbnb/tuma/integration
GET /api/auth/google/callback
POST /api/auth/google/complete-phone
GET /api/auth/google/config
GET,POST /api/auth/google
POST /api/auth/otp/resend
POST /api/auth/otp/verify
GET /api/auth/session
GET /api/cron/airbnb-reminders
GET /api/cron/renew-invoices
GET /api/cron/send-invoice-reminders
GET /api/cron/send-payment-reminders
GET /api/csrf-token
POST /api/devices/push-token
GET,POST /api/expenses
GET /api/fix-property-units
POST /api/generate-excel
POST /api/impersonate
GET /api/invoices/estimate
POST /api/invoices/excel
POST /api/invoices/generate
GET,POST /api/invoices
PATCH /api/invoices/update-status
POST /api/kopokopo/webhook
POST /api/lifetime/checkout
GET /api/lifetime/checkout/status
GET,POST /api/lifetime/plan
DELETE,GET,POST,PUT /api/list-properties
POST /api/mpesa/c2b-confirmation
POST /api/mpesa/c2b-register
POST /api/mpesa/c2b-validation
GET,POST /api/mpesa/connect
GET /api/mpesa/shortcode
POST /api/mpesa/stk-callback
POST /api/mpesa/stk-push
DELETE,GET,POST /api/notifications/reminders
DELETE,GET,PATCH,POST /api/notifications
GET /api/owner-dues
GET /api/owner/activities
POST /api/owner/daraja/callback
DELETE,GET,PUT /api/owner/daraja
POST /api/owner/daraja/status
POST /api/owner/daraja/stk-push
DELETE,GET,PUT /api/owner/integrations
POST /api/owner/invoice-payments/daraja-callback
POST /api/owner/invoice-payments/daraja-status
POST /api/owner/invoice-payments/daraja-stk-push
GET,PUT /api/owner/payment-settings
POST /api/owner/reset-password-request
POST /api/owner/reset-password
GET,POST /api/owner/tier
GET /api/owner/tuma/banks
POST /api/owner/tuma/business
GET /api/ownercharts
GET /api/ownerstats
route-specific /api/payments/{paymentId}/reverse
route-specific /api/payments/{paymentId}
POST /api/payments/excel
GET,POST /api/payments
GET /api/pending-invoices
route-specific /api/properties/{propertyId}
GET,POST /api/properties
GET /api/property-charts
GET /api/property-owner-data
GET /api/property-owners/maintenance
GET,PATCH /api/property-owners/tenant-deletions
GET,PATCH /api/property-owners/vacate
POST /api/public-bookings
route-specific /api/public-properties/{id}/reviews
route-specific /api/public-properties/{id}
GET /api/public-properties
POST /api/public/contact
GET /api/public/properties
GET,POST /api/referrals
route-specific /api/rent-price-overrides/{overrideId}
GET,POST /api/rent-price-overrides
GET /api/reports
POST /api/revert-impersonation
GET,PATCH,POST,PUT /api/settings
POST /api/signin
POST /api/signout
POST /api/signup
POST /api/stripe/webhook
GET,PATCH /api/support/conversations
DELETE,GET,PATCH,POST /api/support/messages
GET,POST /api/support/presence
POST /api/support/upload
POST /api/system-errors/client
POST /api/system-errors/ingest
route-specific /api/team-members/{id}
GET,POST /api/team-members
POST /api/tenant/change-password
GET,POST /api/tenant/dues
GET /api/tenant/features
DELETE,GET,PATCH /api/tenant/notifications
POST /api/tenant/payments/check-status
POST /api/tenant/payments/manual
GET /api/tenant/payments/receipt
GET,POST /api/tenant/payments
POST /api/tenant/payments/update-fields
GET,PUT /api/tenant/profile
POST /api/tenant/reset-password-request
POST /api/tenant/reset-password
route-specific /api/tenants/{tenantId}/rent-overrides/{overrideId}
route-specific /api/tenants/{tenantId}/rent-overrides
route-specific /api/tenants/{tenantId}
GET,POST /api/tenants/check-dues
route-specific /api/tenants/maintenance/{id}
GET,POST /api/tenants/maintenance
POST /api/tenants/resend-welcome
GET,POST /api/tenants
GET,POST /api/tenants/vacate
POST /api/transaction-status
POST /api/tuma/webhook
POST /api/update-wallet
POST /api/upload
GET /api/user
route-specific /api/utility-charges/{id}
GET,POST /api/utility-charges
```
