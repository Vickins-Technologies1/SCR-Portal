# Sorana Daraja Readiness

Sorana's initial Daraja launch supports STK Push. C2B validation, confirmation, and URL registration are intentionally disabled until a complete PayBill reconciliation flow is implemented. The C2B routes return an explicit `501` response and must not be registered with Safaricom.

## Callback URL

Set `MPESA_CALLBACK_BASE_URL` to the deployed Sorana HTTPS origin. The STK callback is:

`https://<deployed-sorana-host>/api/mpesa/stk-callback`

The exact host cannot be determined from this repository; it is a deployment value and must be confirmed in Vercel before creating the Daraja production app.

## Status

The code is ready for sandbox configuration and end-to-end testing after the automated checks pass. It is not production-ready until a real sandbox callback and reconciliation test succeeds, then the production Daraja app, shortcode, passkey, HTTPS callback, and Vercel environment are configured.
