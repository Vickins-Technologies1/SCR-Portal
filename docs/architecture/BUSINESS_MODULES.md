# Business modules and access model

## Roles found in implementation

The role union in `src/proxy.ts` includes `admin`, `adminTeamMember`, `propertyOwner`, `teamMember`, and `tenant`. Short-stay tenants use the tenant role plus Airbnb-specific routes/records; no separate guest role was established. No property-management-organization administrator role or organization entity was found. The product serves the management company, but current tenancy boundaries are primarily owner/property identifiers.

| Role | Verified capabilities and enforcement | Limits |
| --- | --- | --- |
| `admin` | Platform administration, billing/configuration and sensitive owner operations. Admin pages and APIs are mapped in proxy; some endpoints call `requireAdmin()`. | Enforcement is route-specific; broad admin data access exists. Audit of every admin route’s permission use was not exhaustive. |
| `adminTeamMember` | Staff account with permissions in `adminTeamMembers`; `src/lib/admin-auth.ts` loads active record and normalizes permissions. Permission vocabulary/presets in `admin-permissions.ts`. | `adminPermissionsCover()` grants feature-level coverage based on `admin:feature:*` grouping, so some action/view distinctions may collapse. Not every admin handler necessarily calls `requireAdmin()`. |
| `propertyOwner` | Manages own rental or Airbnb properties, tenants, payments, invoices, reports, integrations, staff and settings. Proxy carries owner identity and management type; handlers often check ownership. | Access isolation depends on handler filters; there is no database row-level security. |
| `teamMember` | Owner-scoped access to rental/Airbnb operations and selected settings. `teamMembers` records are owner-scoped; default permission helper exists. | Granular owner-team permission enforcement varies by handler. UI permission hooks are not sufficient protection. |
| `tenant` | Tenant portal, own payment/dues, notifications, maintenance, account/profile and short-stay guest paths. | Some endpoints derive record ownership by tenant ID; relationship consistency must be enforced at each mutation. |

`src/lib/permissions.ts` defines default owner/team/tenant permissions, but the application does not demonstrate a uniform centralized permission check for every API operation. See findings in [Security audit](SECURITY_AUDIT.md).

## Feature inventory and code traceability

Status reflects source evidence, not production readiness.

| Module | Status | UI / route families | Core implementation |
| --- | --- | --- | --- |
| Registration, login, session, password reset, Google OAuth, OTP | Verified | `/sign-up`, `/tenant-login`, `/admin/login`, `/reset-password`; `/api/signin`, `/api/signup`, `/api/auth/**`, `/api/tenant/**reset-password*` | `src/lib/session.ts`, `auth.ts`, `otp.ts`, `google-auth.ts`, `src/app/api/auth/**` |
| Owners and staff | Verified | `/property-owner-dashboard/users`, `/admin/team-members`; `/api/team-members`, `/api/admin/team-members` | `src/lib/permissions.ts`, `admin-auth.ts`, owner/team routes |
| Properties and units | Verified | `/property-owner-dashboard/properties`, property details; `/api/properties`, `/api/admin/properties` | `src/app/api/properties/**`, `src/types/property.ts`, `unitTypes.ts` |
| Tenant records and occupancy | Verified | owner tenant pages, tenant portal; `/api/tenants/**` | `src/app/api/tenants/**`, `tenant-occupancy.ts`, `tenant-payment-allocation.ts` |
| Rent schedules and overrides | Verified | tenant modals/settings; `/api/rent-price-overrides`, `/api/tenants/{tenantId}/rent-overrides` | `rent-overrides.ts`, `src/lib/utils.ts` |
| Utility billing | Verified | utility charge modal; `/api/utility-charges/**` | `property-utilities.ts`, utility charge routes |
| Payments, receipts, allocations and reversals | Verified | owner/tenant payment pages; `/api/payments/**`, `/api/tenant/payments/**` | `verified-payment-posting.ts`, `financial-ledger.ts`, `tenant-payment-allocation.ts` |
| Invoices, PDFs and reminders | Verified | owner/admin billing and invoice pages; `/api/invoices/**`, cron reminders | `billing.ts`, `invoice-calculations.ts`, `invoice-pdf.ts`, `invoice-reminders.ts` |
| Financial statements, reports and exports | Verified | owner/admin reports; `/api/reports`, `/api/ownerstats`, `/api/ownercharts`, Excel/PDF endpoints | `financial-reporting.ts`, `property-report.ts`, Excel/PDF routes |
| Daraja STK/C2B and owner routing | Verified | tenant payment UI, owner integration settings; `/api/mpesa/**`, `/api/owner/daraja/**` | `mpesa.ts`, `daraja-callback.ts`, `c2b.ts`, `owner-daraja.ts`, `LandlordMpesa.ts` |
| KopoKopo and Tuma | Verified in code | owner integration/payment APIs; provider webhooks | `kopokopo.ts`, `tuma.ts`, `tuma-incoming.ts`, webhook routes |
| Airbnb/short-stay listings, bookings, calendar, operations, guest portal | Verified in code | `/airbnb-dashboard/**`, `/airbnb-tenant-dashboard/**`, admin Airbnb pages; `/api/airbnb/**` | `airbnb-*.ts`, Airbnb API route families |
| Public listings, reviews and marketplace | Verified | `/property-listings`, `/market-place`; `/api/public/**`, `/api/admin/reviews/**` | `property-reviews.ts`, `public-property-availability.ts`, listing routes |
| Notifications and reminders | Verified | owner/tenant notification pages; `/api/notifications/**`, cron | `reminders.ts`, `invoice-reminders.ts`, notification routes |
| Email, SMS, WhatsApp and push | Partially verified | integrations/communications and device APIs | `email.ts`, `sms.ts`, `whatsapp.ts`, `src/app/api/devices/push-token/route.ts`; vendor account behavior unverified |
| Subscription/lifetime access and referrals | Verified in code | `/upgrade`, lifetime checkout, referrals/admin pages | `tier.ts`, `billing.ts`, `lifetime.ts`, `referrals.ts` |
| Expenses and management fees | Partially verified | owner expenses; invoices/billing | `/api/expenses`, `billing.ts`, `airbnb-billing.ts`; full accounting model not established |
| Audit and error monitoring | Partially verified | owner activity/admin system errors | `owner-activity.ts`, `system-error-monitor.ts`, `auditLogs` and related writes; comprehensive audit coverage unverified |
| File upload and exports | Verified in code | upload APIs, Excel/PDF routes | `/api/upload`, `/api/support/upload`, `invoice-pdf.ts`, ExcelJS endpoints; storage hardening varies |
| Reservations/booking | Verified for short-stay and listing requests | `/market-place`, `/airbnb-dashboard/bookings`; public booking routes | `airbnb-booking-workflow.ts`, availability and public booking handlers |

## Module details and boundaries

The app combines owner rental management and a parallel short-stay operating area. Pages are segmented by route tree and sidebars; backend operations are segmented by route prefix and helper module. Core rental collections are `properties`, `tenants`, `payments`, `invoices`, `utilityCharges`, and notifications. Airbnb modules use `airbnbListings`, `airbnbBookings`, calendar, pricing, tasks, compliance, messages and payout collections. Admin functions span owner lifecycle, payments, subscriptions, referral, support, review and error management.

Several feature labels (for example lease management, management-company administration, bank settlement, document signing, platform-wide audit trail) should not be interpreted as complete product capabilities from navigation alone. No signed lease/document workflow or first-class management organization entity was confirmed in this inspection. “Not found” in this source review does not rule out a manual operating process.

## Data visibility and ownership

The principal boundary is `propertyOwners._id` / `ownerId`; team records carry `ownerId`; property and tenant records carry owner/property relationships. Payment posting checks tenant-to-property linkage when `tenantId` is populated and checks `landlordId` against property owner when present. Admin workflows may intentionally cross owner boundaries. Proxy role checks establish broad role eligibility, while route handlers must enforce exact ownership. No universal repository abstraction automatically applies owner scoping.

## Known discrepancies to review

- Some handler paths rely on cookies/role or proxy route maps; others read signed sessions through `getCurrentSession()` or call `requireAdmin()`. The enforcement pattern is heterogeneous.
- Team-member permission granularity exists in types and UI helpers, but enforcement is not uniformly established by source search.
- Similar payment, booking and report features share collections but may use separate aggregation logic.
- Root README is marketing-oriented and not a reliable technical inventory; the architecture docs derive feature status from source.
