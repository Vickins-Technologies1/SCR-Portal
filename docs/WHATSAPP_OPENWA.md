# WhatsApp / OpenWA operations

## Implemented in the application

- `src/lib/whatsapp-gateway.ts` isolates OpenWA from notification callers. Existing rent reminder calculations and notification triggers continue to produce the message; OpenWA does not calculate balances.
- OpenWA is disabled by default. An installation with no OpenWA settings record retains its existing ApiWap behavior; once an administrator saves the OpenWA settings record, the Enable switch controls all application WhatsApp sends (so clearing the switch disables the channel).
- The admin integrations page can save the gateway URL, session ID, and API key, refresh session status, retrieve a QR code, send a test to an operator controlled number, and inspect recent masked attempts.
- The API key is stored encrypted with AES-256-GCM in `systemSettings`. Configure `WHATSAPP_ENCRYPTION_KEY` as a base64 encoding of exactly 32 random bytes before saving a key. In PowerShell, generate one with `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`. Keep the value in the deployment secret store, back it up securely, and do not rotate it without re-encrypting the stored OpenWA key.
- Message attempts are persisted in MongoDB collection `whatsappMessageAttempts`; a unique partial idempotency index and operational indexes are added by the application's normal production index bootstrap. Recipient numbers are masked. Queued message content is encrypted and removed after submission, terminal failure, cancellation, or uncertain outcome. A gateway timeout is stored as `unknown` because OpenWA may have accepted the send before the connection failed. Only definite HTTP 429 rejections receive bounded retries, using the provider idempotency key.
- Tenant and property-owner settings now provide an explicit WhatsApp opt-in. Consent is tied to an HMAC fingerprint of the phone number saved at opt-in, so changing a profile number requires opting in again. This consent check applies to OpenWA and the legacy ApiWap path, and is rechecked immediately before queued sends. Turning consent off cancels unsent queued attempts. Signed inbound `message.received` webhooks revoke consent for STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, and QUIT, cancel unsent attempts, and deduplicate event IDs; delivery-event records expire after 90 days. Passwords and password-reset links are excluded from WhatsApp account messages.
- Consent phone fingerprints use an HMAC keyed from the application's `JWT_SECRET`; use a high-entropy secret of at least 32 characters, consistent across app instances. Rotating it requires recipients to opt in again.
- The admin test action is the only application send that bypasses recipient opt-in, and it requires an authenticated administrator to enter the operator-controlled test number. Admin status/QR/test actions are rate limited; QR responses are marked private/no-store. In production, set `OPENWA_GATEWAY_HOSTS` to a comma-separated allowlist of exact gateway hostnames. The application refuses gateway URLs outside this list.
- OpenWA sends are enqueued and the `/api/cron/process-whatsapp-outbox` route drains up to 20 per invocation. The application repository does not enable a Vercel cron for this route: configure an authenticated external scheduler (or a plan-supported schedule) at an operational cadence appropriate to your delivery SLA. The route requires the existing `CRON_SECRET` authorization. Disabling the OpenWA integration cancels unsent queued/retry-wait attempts and clears their encrypted payloads; an already in-flight provider request may still complete.
- The webhook receiver is `/api/webhooks/openwa`; set `OPENWA_WEBHOOK_SECRET` (at least 16 characters) and register this URL in the OpenWA session for `message.ack`, `message.failed`, and `message.received`, with the same secret. The receiver verifies the HMAC against raw bytes and uses OpenWA delivery IDs to deduplicate. The admin UI does not yet register the provider webhook automatically.
- Current `sendPaymentReminders` remains the source of reminder balances and already persists its notification intent before dispatch. WhatsApp submission does not change payment allocations or payment state. SMS/email branches are unchanged.

## Verified OpenWA contract and selected release

Reviewed `rmyndharis/OpenWA` release **v0.26.0**, signed commit `386464e229e1762d95c8a1c0ddb9e2c8b13604bc` (MIT). The repository documents Node.js 22 LTS and Docker Compose. The application uses:

- `GET /api/sessions/{sessionId}` with `X-API-Key` to read the session state.
- `GET /api/sessions/{sessionId}/qr` with `X-API-Key`; the response includes a `qrCode` image data URL.
- `POST /api/sessions/{sessionId}/messages/send-text` with `{ "chatId": "2547…@c.us", "text": "…" }` and `X-API-Key`. HTTP acceptance is shown as `submitted`, not delivered.

The OpenWA README documents session creation, start, QR retrieval, text sending, webhook setup, HMAC webhooks, Docker Compose, persistent data, and optional status/receipt events. Delivery webhooks now update message attempts with sent/delivered/read/failed states. Do not treat a `201` send response as delivery confirmation.

OpenWA is a self-hosted WhatsApp Web integration and is not the official Meta WhatsApp Business Platform. WhatsApp Web protocol changes, session disconnections, and account restrictions are operational risks. For regulated or high-volume business messaging, evaluate the official WhatsApp Business Platform separately; this implementation does not switch providers automatically.

## Deploying the gateway

The main application is configured for Vercel (`vercel.json`) and cannot host the persistent OpenWA session. Deploy OpenWA as a separate persistent Docker host/container service. Before production use:

1. On the gateway host, fetch the reviewed source and pin the release: `git clone https://github.com/rmyndharis/OpenWA.git && cd OpenWA && git checkout v0.26.0`.
2. Review the release's production `docker-compose.yml` and `.env.example`; set unique strong admin/API credentials and use the supported production Compose setup. Start it with `docker compose up -d` (or the documented profile required by the chosen database/storage). Avoid `latest` tags.
3. Persist and back up OpenWA's `/app/data` volume, including linked session state. Keep backups encrypted and access restricted. Test restoration and a controlled restart before onboarding recipients.
4. Put the API behind TLS and ingress restricted to the application runtime or a private network/VPN. Do not publicly expose the OpenWA dashboard or API without a strict access policy. The API key is a bearer credential; create a dedicated operator key scoped to the one session when supported, and rotate by replacing it in Admin → Integrations.
5. Monitor container health, disk, CPU/memory, logs, and restart events. OpenWA documents `/api/health`, `/api/health/live`, and `/api/health/ready`; a healthy container does not mean the WhatsApp session is connected.
6. In Admin → Integrations, set the HTTPS gateway URL, session ID, and API key. Save with Enable unchecked first. Refresh session status. Create/start the session through the secured OpenWA dashboard/API and scan the displayed QR with the operator's WhatsApp account. The QR is a login credential; keep it private and hide it after use.
7. Set `OPENWA_GATEWAY_HOSTS`, `OPENWA_WEBHOOK_SECRET`, and `WHATSAPP_ENCRYPTION_KEY` in the application environment. Register `/api/webhooks/openwa` on the OpenWA session for `message.ack`, `message.failed`, and `message.received`, using the same webhook secret; verify a delivery and a STOP opt-out.
8. Configure an authenticated recurring caller for `/api/cron/process-whatsapp-outbox`. Confirm it drains queued jobs and that the schedule meets your required delivery SLA.
9. Send one explicitly authorized test to an operator-controlled number. Verify the message on the recipient device and inspect the recorded attempt. Enable the integration only after the operator accepts the unofficial gateway risk and signs off the test. Recipients must opt in from their account settings before regular app messages are queued.

The app currently sends requests from Vercel to the configured gateway URL. A private network is preferred; if Vercel cannot route to the chosen private host, provision an appropriately secured HTTPS ingress with strict source restrictions. The actual production network, gateway host, DNS, credentials, and account are not present in this repository and have not been configured.

## Activation and rollback checklist

- [ ] Provision persistent OpenWA host and TLS/restricted network path.
- [ ] Pin v0.26.0 and configure API key/session scope and persistent volume backups.
- [ ] Set `WHATSAPP_ENCRYPTION_KEY` in Vercel; verify the same secret is present in every application environment that reads the setting.
- [ ] Create/start the OpenWA session and scan its QR using the account owner's phone.
- [ ] Verify status is `connected` and perform an authorized test send; check actual receipt manually.
- [ ] Review recipient consent and opt-out handling, phone data quality, monitoring, and an operator's recovery procedure.
- [ ] Enable WhatsApp in Admin → Integrations only after the staging/live test is authorized and successful.

To roll back, clear Enable WhatsApp and save; if returning to the legacy ApiWap provider, remove the saved `systemSettings` record with `_id: "openwa"` through a controlled admin database operation and restore the prior ApiWap environment configuration. Existing SMS and email are unaffected. Never delete the persistent OpenWA volume while it contains the only linked session. No production deployment, DNS, firewall, account linking, external credential setup, or live message was performed by this code change.

## Remaining production work

- Provision and monitor the OpenWA host, gateway allowlist, session credentials, environment secrets, and authenticated recurring outbox scheduler.
- Register and verify the OpenWA webhook against the deployed app URL; test ack reconciliation and keyword opt-out using controlled accounts.
- Complete an authorized staging rehearsal covering opt-in, phone-number changes, STOP, queued delivery, 429 retry, unknown outcomes, disable/cancel, and recovery after a gateway restart.
- OpenWA remains an unofficial WhatsApp Web integration. Provider availability, account restrictions, policy acceptance, and live account behavior require an operator's review and sign-off before enablement.
- Existing ApiWap behavior remains available only for opted-in recipients when no OpenWA settings record exists. Saving an OpenWA settings record selects that integration; the Enable switch is a global send stop for regular WhatsApp traffic. Retire the legacy token deliberately after migration.
