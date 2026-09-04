# Sorana Daraja Readiness

Sorana's Daraja launch supports backend-only STK Push. M-PESA shortcodes and PayBill/Till accounts are expected to be configured in the M-PESA Org Admin Portal or database-backed owner configuration, not created by the app. The app now resolves the correct shortcode from backend configuration and never attempts to provision one through Daraja.

C2B validation, confirmation, and URL registration remain intentionally disabled in the application until a complete PayBill reconciliation flow is implemented. The C2B routes return an explicit `501` response and must not be registered from the app.

## Callback URL

Set `MPESA_CALLBACK_BASE_URL` to the deployed Sorana HTTPS origin. The STK callback is:

`https://<deployed-sorana-host>/api/mpesa/stk-callback`

The exact host cannot be determined from this repository; it is a deployment value and must be confirmed in Vercel before creating the Daraja production app.

## Status

The code is ready for sandbox configuration and end-to-end testing after the automated checks pass. It is not production-ready until a real sandbox callback and reconciliation test succeeds, then the production Daraja app, shortcode(s), passkey, HTTPS callback, and Vercel environment are configured.
