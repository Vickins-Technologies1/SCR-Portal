# WhatsApp / OpenWA operations

## Implemented in the application

- `src/lib/whatsapp-gateway.ts` isolates OpenWA from notification callers. Existing rent reminder calculations and notification triggers continue to produce the message; OpenWA does not calculate balances.
- OpenWA is disabled by default. An installation with no OpenWA settings record retains its existing ApiWap behavior; once an administrator saves the OpenWA settings record, the Enable switch controls all application WhatsApp sends (so clearing the switch disables the channel).
- The admin integrations page can save the gateway URL, session ID, and API key, refresh session status, retrieve a QR code, send a test to an operator controlled number, and inspect recent masked attempts.
- The API key is stored encrypted with AES-256-GCM in `systemSettings`. Configure `WHATSAPP_ENCRYPTION_KEY` as a base64 encoding of exactly 32 random bytes before saving a key. In PowerShell, generate one with `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))`. Keep the value in the deployment secret store, back it up securely, and do not rotate it without re-encrypting the stored OpenWA key.
- Message attempts are persisted in MongoDB collection `whatsappMessageAttempts`; a unique partial idempotency index and operational indexes are added by the application's normal production index bootstrap. Recipient numbers are masked and message bodies are not retained. A gateway timeout is stored as `unknown` because OpenWA may have accepted the send before the connection failed. No automatic retry is made.
- Current `sendPaymentReminders` remains the source of reminder balances and already persists its notification intent before dispatch. WhatsApp submission does not change payment allocations or payment state. SMS/email branches are unchanged.

## Verified OpenWA contract and selected release

Reviewed `rmyndharis/OpenWA` release **v0.26.0**, signed commit `386464e229e1762d95c8a1c0ddb9e2c8b13604bc` (MIT). The repository documents Node.js 22 LTS and Docker Compose. The application uses:

- `GET /api/sessions/{sessionId}` with `X-API-Key` to read the session state.
- `GET /api/sessions/{sessionId}/qr` with `X-API-Key`; the response includes a `qrCode` image data URL.
- `POST /api/sessions/{sessionId}/messages/send-text` with `{ "chatId": "2547…@c.us", "text": "…" }` and `X-API-Key`. HTTP acceptance is shown as `submitted`, not delivered.

The OpenWA README documents session creation, start, QR retrieval, text sending, webhook setup, HMAC webhooks, Docker Compose, persistent data, and optional status/receipt events. This application currently does **not** process OpenWA delivery webhooks; it therefore does not display delivered/read statuses. Do not treat a `201` send response as delivery confirmation.

OpenWA is a self-hosted WhatsApp Web integration and is not the official Meta WhatsApp Business Platform. WhatsApp Web protocol changes, session disconnections, and account restrictions are operational risks. For regulated or high-volume business messaging, evaluate the official WhatsApp Business Platform separately; this implementation does not switch providers automatically.

## Deploying the gateway

The main application is configured for Vercel (`vercel.json`) and cannot host the persistent OpenWA session. Deploy OpenWA as a separate persistent Docker host/container service. Before production use:

1. On the gateway host, fetch the reviewed source and pin the release: `git clone https://github.com/rmyndharis/OpenWA.git && cd OpenWA && git checkout v0.26.0`.
2. Review the release's production `docker-compose.yml` and `.env.example`; set unique strong admin/API credentials and use the supported production Compose setup. Start it with `docker compose up -d` (or the documented profile required by the chosen database/storage). Avoid `latest` tags.
3. Persist and back up OpenWA's `/app/data` volume, including linked session state. Keep backups encrypted and access restricted. Test restoration and a controlled restart before onboarding recipients.
4. Put the API behind TLS and ingress restricted to the application runtime or a private network/VPN. Do not publicly expose the OpenWA dashboard or API without a strict access policy. The API key is a bearer credential; create a dedicated operator key scoped to the one session when supported, and rotate by replacing it in Admin → Integrations.
5. Monitor container health, disk, CPU/memory, logs, and restart events. OpenWA documents `/api/health`, `/api/health/live`, and `/api/health/ready`; a healthy container does not mean the WhatsApp session is connected.
6. In Admin → Integrations, set the HTTPS gateway URL, session ID, and API key. Save with Enable unchecked first. Refresh session status. Create/start the session through the secured OpenWA dashboard/API and scan the displayed QR with the operator's WhatsApp account. The QR is a login credential; keep it private and hide it after use.
7. Send one explicitly authorized test to an operator controlled number. Verify the message on the recipient device and inspect the recorded attempt. Enable the integration only after the operator accepts the unofficial gateway risk and signs off the test.

The app currently sends requests from Vercel to the configured gateway URL. A private network is preferred; if Vercel cannot route to the chosen private host, provision an appropriately secured HTTPS ingress with strict source restrictions. The actual production network, gateway host, DNS, credentials, and account are not present in this repository and have not been configured.

## Activation and rollback checklist

- [ ] Provision persistent OpenWA host and TLS/restricted network path.
- [ ] Pin v0.26.0 and configure API key/session scope and persistent volume backups.
- [ ] Set `WHATSAPP_ENCRYPTION_KEY` in Vercel; verify the same secret is present in every application environment that reads the setting.
- [ ] Create/start the OpenWA session and scan its QR using the account owner's phone.
- [ ] Verify status is `connected` and perform an authorized test send; check actual receipt manually.
- [ ] Review reminder preferences, recipient consent, phone data quality, monitoring, and an operator's recovery procedure.
- [ ] Enable WhatsApp in Admin → Integrations only after the staging/live test is authorized and successful.

To roll back, clear Enable WhatsApp and save; if returning to the legacy ApiWap provider, remove the saved `systemSettings` record with `_id: "openwa"` through a controlled admin database operation and restore the prior ApiWap environment configuration. Existing SMS and email are unaffected. Never delete the persistent OpenWA volume while it contains the only linked session. No production deployment, DNS, firewall, account linking, external credential setup, or live message was performed by this code change.

## Known implementation limits

- No durable asynchronous outbox worker or scheduled retry handler has been added. Existing scheduled rent reminders persist intent and deduplicate as before, but calls to the gateway are made by the existing caller (including the scheduled reminder invocation). A separate persistent worker is required before relying on queued delivery or automatic retries.
- Per-message OpenWA webhooks and delivery reconciliation are not connected to the application. Attempt states are `queued`, `submitted`, `failed`, `unknown`, or `rejected`; no delivery/read claim is made.
- The OpenWA test action is operator initiated and records masked recipient data. Automated tests use mocked HTTP and do not contact WhatsApp.
- Existing ApiWap caller behavior remains as the compatibility fallback when `APIWAP_TOKEN` is configured and OpenWA is not enabled. Admin OpenWA settings only control the OpenWA path; retire the legacy token deliberately after migration.
