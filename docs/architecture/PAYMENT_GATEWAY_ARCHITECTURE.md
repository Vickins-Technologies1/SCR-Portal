# Payment gateway architecture

## Integration inventory

| Provider/interface | Implemented behavior | Confirmation and controls | Status |
| --- | --- | --- | --- |
| Safaricom Daraja STK | OAuth access token, STK push initiation, callback, transaction status, owner-configured account routing | Callback schema validation, lookup by provider IDs, conditional callback claim, receipt replay detection and `postVerifiedPayment()` for ordinary tenant payments; amount/relationship conflicts can be quarantined | Verified in source; provider registration and production operation unverified |
| Daraja C2B | Confirmation and validation callback endpoints; shortcode maps through `LandlordMpesa` | Invoice and landlord lookup; tenant must resolve uniquely; amount must not exceed posted invoice balance; unmatched/ambiguous/over-balance callbacks are retained for reconciliation; shared posting service handles matched receipts | Verified in source; Safaricom callback configuration unverified |
| KopoKopo | OAuth client-credentials token and incoming payment initiation; webhook | HMAC signature verification, normalized provider status, shared posting service for successful payment | Verified in source; webhook registration unverified |
| Tuma | Token retrieval, STK push and integration endpoints; webhook | Webhook records received events and successful path calls shared posting service; inspect current request auth/config per route before enabling | Verified in source; cryptographic signature verification was not confirmed in inspected webhook handler |
| Stripe | Webhook completion path for Airbnb/short-stay and booking payments | HMAC signature and timestamp tolerance check; inserts/updates payment and synchronizes booking/pending stay extension | Verified in source; general tenant rent payment support not established |
| Owner payment instructions | Paybill/Till/bank detail fields in Mongoose `LandlordMpesa`; owner Daraja integrations in Mongo | Routing/configuration and encrypted legacy passkey support appear in helper code; provider settlement/account ownership not verified | Partially verified |

## Daraja STK lifecycle

1. Authenticated client calls an STK initiation route. The route validates payload, user/tenant/property context and payment intent, then persists a pending payment record with provider identifiers.
2. `src/lib/mpesa.ts` obtains OAuth credentials from server configuration, generates password/timestamp values and submits STK requests to sandbox or production endpoints selected from config. A token cache exists in provider helper code.
3. Callback URL is built from configured base URL or route logic; callback reachability depends on public deployment configuration.
4. `/api/mpesa/stk-callback` parses with `DarajaCallbackSchema`, correlates and conditionally claims in `daraja-callback.ts`, stores unmatched callbacks, and does not silently acknowledge an unmatched STK callback as complete.
5. Ordinary tenant payment success calls `postVerifiedPayment()` with metadata amount and receipt/checkout identifiers. Product-specific Airbnb and lifetime payments take specialized paths.

No Daraja callback HMAC/signature verification was found. The callback relies on unguessable/correlatable identifiers and the transport/provider request; this is weaker evidence than a cryptographically authenticated webhook. Provider-to-server IP restrictions or mutual TLS were not verified.

## C2B lifecycle

`POST /api/mpesa/c2b-validation` and `/api/mpesa/c2b-confirmation` implement separate interfaces. Confirmation parses `TransID`, amount, shortcode and invoice reference; maps shortcode to landlord configuration; finds a payable invoice; resolves exactly one tenant from invoice linkage or scoped fallback; computes current invoice balance from posted payment rows; and retains ambiguous or amount-exceeding receipts in `unmatchedMpesaCallbacks`. A matched receipt is upserted with provider IDs and then passed to the shared posting service. This current behavior addresses earlier ambiguity/overpayment concerns noted in root `AUDIT_PAYMENT_FLOW.md`.

The exact validation response semantics, configured Safaricom URLs, retry behavior in production and reconciliation operator workflow remain unverified. C2B reference and invoice matching depend on provider-entered reference values and account configuration.

## KopoKopo and Tuma

KopoKopo credentials and API URLs are read from environment config; its helper caches OAuth token and chooses production/sandbox defaults. The webhook verifies `x-kopokopo-signature` against the raw body before parsing, normalizes statuses, correlates the request/resource/reference and invokes shared posting on successful ordinary payments. Provider callback replay safety benefits from payment/provider identity checks and posting claims; end-to-end retry semantics remain provider dependent.

Tuma caches tokens keyed by endpoint/account credentials and uses a STK API. Its webhook writes a `tumaWebhooks` event and maps to a payment. The route calls shared posting for successful payment updates. A signature/HMAC verification step was not evident in the inspected Tuma webhook route; callback secret or network controls require review before production trust.

## Stripe

`src/app/api/stripe/webhook/route.ts` verifies a Stripe-style timestamped HMAC header using raw request bytes and rejects stale signatures when the configured tolerance is exceeded. It handles `payment_intent.succeeded` and `checkout.session.completed`, stores the payment and synchronizes Airbnb booking settlement/extension state. Stripe keys and webhook secret are expected in server configuration but were not listed in the shown `.env.example` section inspected; exact deployment variables must be confirmed with operators. It does not use ordinary tenant allocation for Airbnb payment rows.

## Idempotency, replay and reconciliation

The payment index bootstrap defines unique keys for payment IDs, Daraja checkout/merchant/receipt identifiers, provider transaction IDs, financial ledger event keys, wallet transaction keys, and unmatched callback identifiers. `postVerifiedPayment()` additionally performs duplicate identity lookup and a conditional posting claim. These protections reduce duplicate posting but do not make all provider operations atomic with notification, referral, entitlement and booking side effects. Provider event retention and retry processing are not uniform. A general dead-letter queue/replay console was not confirmed; unmatched callback and admin webhook inspection surfaces exist.

## Secret and settlement handling

`.env.example` contains variable names only in this document: Daraja (`MPESA_*`), KopoKopo (`KOPOKOPO_*`), Tuma (`TUMA_*` / owner integration), SMTP and other service names. Values are intentionally omitted. Owner credentials can also be stored in Mongo integration documents; encryption and key rotation should be verified operationally. Landlord-configured Paybill/Till/bank data describes routing details, but the repository does not prove where funds settle or that each owner is independently connected to a provider.

## Operational checklist (not executed)

- Confirm each production callback URL is public, TLS-protected and registered with the right provider account.
- Confirm credentials are scoped server-side, rotated and absent from client bundles/logs.
- Verify Tuma and Daraja callback authenticity controls with provider documentation and deployment controls.
- Reconcile test receipts in a sandbox only; do not use production transactions for this audit.
- Confirm provider transaction identity uniqueness and retry behavior against deployed indexes.
- Confirm unmatched/quarantined event review and resubmission procedures.
