# Property owner invoice payment routing

## Effective provider precedence

Invoice payment routing is platform-wide. There are no owner, property, or invoice overrides for new invoice payment attempts.

1. `platformSettings` document `_id: "property_owner_invoice_payments"` field `provider` is canonical.
2. The legacy `invoicePaymentProvider` field is read only when `provider` is absent.
3. If neither setting exists, routing defaults to `kopokopo` for backward compatibility.
4. A persisted value outside `kopokopo` and `daraja` is an error. It is not silently mapped to another provider.

An invoice's `paymentProvider` field may reflect the provider when that invoice was created or paid. It does not select the provider for a new attempt. The authenticated server resolves the current platform setting when the owner requests payment and ignores client provider or destination fields.

## Transaction continuity

Each payment attempt records its provider and provider-specific identifiers in its payment record. Pending status checks and callbacks use that record. Changing the platform setting affects subsequent attempts only; it does not edit, reassign, or re-verify an existing payment using the newly selected provider.

Daraja invoice attempts use the platform Daraja credentials and invoice callback. KopoKopo invoice attempts use the configured platform till and KopoKopo webhook/status flow. Tenant and property rent payment routing continues to use its existing separate owner/property rules.
