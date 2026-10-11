// src/lib/tuma-incoming.ts
import { Db, ObjectId } from "mongodb";
import logger from "@/lib/logger";
import { sendAirbnbPaymentReceivedEmail, sendConfirmationEmail } from "@/lib/email";
import { sendWelcomeSms } from "@/lib/sms";
import { deactivateAirbnbGuestTenantsForBooking, syncAirbnbBookingPaymentStatus } from "@/lib/airbnb-payments";
import { reconcileTenantPaymentAllocation } from "@/lib/tenant-payment-allocation";
import { qualifyReferralFromFirstPaidInvoice } from "@/lib/referrals";

export type TumaIncomingUpdate = {
  id: string;
  status?: string;
  resultCode?: number | string;
  resultDesc?: string;
  failureReason?: string;
  reference?: string;
  mpesaReceiptNumber?: string;
  amount?: number;
  phoneNumber?: string;
  timestamp?: string;
  gatewayTimestamp?: string;
};

export function isLikelyMpesaReceipt(reference?: string): boolean {
  if (!reference) return false;
  const trimmed = reference.trim();
  return /^[A-Z0-9]{10}$/i.test(trimmed);
}

export function normalizeTumaStatus(params: {
  status?: string;
  resultCode?: number | string;
  resultDesc?: string;
  failureReason?: string;
}) {
  const status = String(params.status || "").toLowerCase();
  const resultDesc = String(params.resultDesc || params.failureReason || "").toLowerCase();
  const resultCode = params.resultCode != null ? String(params.resultCode).toLowerCase() : "";

  if (status.includes("complete") || status === "success") return "completed";
  if (status.includes("cancel")) return "cancelled";
  if (status.includes("fail")) return "failed";

  if (resultCode && resultCode !== "0") return "failed";
  if (resultDesc.includes("cancel")) return "cancelled";
  if (resultDesc.includes("fail") || resultDesc.includes("timeout") || resultDesc.includes("expired")) {
    return "failed";
  }

  return "pending_stk";
}

function parseTimestamp(timestamp?: string): string | null {
  if (!timestamp) return null;
  const trimmed = String(timestamp).trim();
  if (!trimmed) return null;

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
  }

  // Handle Unix timestamps in seconds or milliseconds.
  if (/^\d{10,13}$/.test(trimmed)) {
    const numeric = Number(trimmed);
    const millis = trimmed.length === 10 ? numeric * 1000 : numeric;
    const parsed = new Date(millis);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  // Handle YYYYMMDDHHmmss
  if (/^\d{14}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(4, 6)) - 1;
    const day = Number(trimmed.slice(6, 8));
    const hour = Number(trimmed.slice(8, 10));
    const minute = Number(trimmed.slice(10, 12));
    const second = Number(trimmed.slice(12, 14));
    const parsed = new Date(Date.UTC(year, month, day, hour, minute, second));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }

  return null;
}

export async function applyTumaPaymentUpdate(params: {
  db: Db;
  payment: any;
  update: TumaIncomingUpdate;
  skipNonTerminalSideEffects?: boolean;
  skipFinancialEffects?: boolean;
}): Promise<{ payment: any; normalizedStatus: string }> {
  const { db, payment } = params;
  const update = params.update;
  const normalizedStatus = normalizeTumaStatus(update);
  const prevStatus = payment.status;

  // Provider webhooks can arrive out of order. A terminal successful event
  // must not be downgraded by a later stale failure/cancellation event.
  if (prevStatus === "completed" && normalizedStatus !== "completed") {
    return { payment, normalizedStatus: prevStatus };
  }

  const patch: Record<string, any> = {};
  if (normalizedStatus && normalizedStatus !== payment.status) {
    patch.status = normalizedStatus;
  }

  const reference = update.mpesaReceiptNumber || update.reference || "";
  if (normalizedStatus === "completed" && reference && isLikelyMpesaReceipt(reference)) {
    patch.mpesaCode = reference;
  }

  const parsedTimestamp = parseTimestamp(update.timestamp || update.gatewayTimestamp);
  if (parsedTimestamp) {
    patch.paymentDate = parsedTimestamp;
  }

  if (update.amount != null) {
    const amount = Number(update.amount);
    if (Number.isFinite(amount) && amount > 0) {
      patch.providerConfirmedAmount = amount;
    }
  }

  if (update.phoneNumber) {
    patch.phoneNumber = update.phoneNumber;
  }

  let updatedPayment = payment;
  if (Object.keys(patch).length > 0) {
    const refreshed = await db.collection("payments").findOneAndUpdate(
      { _id: payment._id },
      { $set: patch },
      { returnDocument: "after" }
    );
    updatedPayment = refreshed?.value ?? payment;
  }

  // Provider status persistence is deliberately separate from financial
  // posting. The webhook handler uses this mode for tenant payments so an
  // unverified or amount-mismatched event cannot reconcile balances, invoices,
  // wallet credit, or notifications before the shared posting boundary.
  if (params.skipFinancialEffects) {
    return { payment: updatedPayment, normalizedStatus };
  }

  if (prevStatus === "completed" && normalizedStatus === "completed") {
    return { payment: updatedPayment, normalizedStatus };
  }

  if (params.skipNonTerminalSideEffects && normalizedStatus === "pending_stk") {
    return { payment: updatedPayment, normalizedStatus };
  }

  if (updatedPayment.invoiceId && ObjectId.isValid(updatedPayment.invoiceId)) {
    if (normalizedStatus === "completed") {
      await qualifyReferralFromFirstPaidInvoice({
        db,
        invoiceId: String(updatedPayment.invoiceId),
        eventId: String(update.id),
      }).catch((error) => logger.error("Referral qualification failed", { invoiceId: updatedPayment.invoiceId, error }));
    }
  }

  if (updatedPayment.airbnbBookingId) {
    const nowIso = new Date().toISOString();
    const bookingId = String(updatedPayment.airbnbBookingId);
    const ownerId = String(updatedPayment.ownerId || "");
    const sync = await syncAirbnbBookingPaymentStatus(db, { ownerId, bookingId, nowIso });

    if (normalizedStatus === "completed") {
      const booking = await db.collection("airbnbBookings").findOne({
        externalId: bookingId,
        ownerId,
      });
      const settings = await db.collection("airbnbSettings").findOne({ ownerId });
      if (booking?.guestEmail && settings?.sendPaymentReceipt !== false) {
        const parsedOrigination = parsedTimestamp ? new Date(parsedTimestamp) : null;
        const validOrigination = parsedOrigination && !Number.isNaN(parsedOrigination.getTime());
        try {
          await sendAirbnbPaymentReceivedEmail({
            to: booking.guestEmail,
            guestName: booking.guestName || "Guest",
            listingName: booking.listingName || "Airbnb Stay",
            amount: update.amount || updatedPayment.amount || 0,
            paymentDate: validOrigination
              ? parsedOrigination!.toLocaleDateString("en-KE", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : new Date().toLocaleDateString("en-KE"),
            reference: reference || updatedPayment.transactionId || update.id,
            supportEmail: settings?.supportEmail,
          });
        } catch (emailError) {
          logger.error("Failed to send Airbnb payment receipt email", {
            bookingId: booking?.externalId,
            message: emailError instanceof Error ? emailError.message : String(emailError),
          });
        }
      }
    }

    if (normalizedStatus === "completed" && sync?.payoutStatus === "paid") {
      if (updatedPayment.airbnbTenantId && ObjectId.isValid(updatedPayment.airbnbTenantId)) {
        await db.collection("tenants").updateOne(
          { _id: new ObjectId(updatedPayment.airbnbTenantId), accountType: "airbnb_guest" },
          { $set: { status: "inactive", updatedAt: nowIso } }
        );
      }
      await deactivateAirbnbGuestTenantsForBooking(db, { ownerId, bookingId, nowIso });
    }
  }

  if (normalizedStatus !== "completed" || !updatedPayment.tenantId) {
    return { payment: updatedPayment, normalizedStatus };
  }

  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(updatedPayment.tenantId) });
  if (!tenant) {
    return { payment: updatedPayment, normalizedStatus };
  }

  const property = await db.collection("properties").findOne({ _id: new ObjectId(updatedPayment.propertyId) });
  if (!property) {
    return { payment: updatedPayment, normalizedStatus };
  }

  const amount = update.amount || updatedPayment.amount || 0;
  // Recalculate once from the authoritative tenant ledger. The previous
  // implementation first subtracted raw payment-type totals and then ran the
  // allocator, which could produce a different balance during the same
  // webhook and could count legacy payments twice.
  await reconcileTenantPaymentAllocation(db, updatedPayment.tenantId);

  const ownerId = typeof property.ownerId === "string" ? property.ownerId : property.ownerId?.toString?.();
  const owner = ownerId
    ? await db.collection("users").findOne({ _id: new ObjectId(ownerId), role: "propertyOwner" })
    : null;

  const parsedOrigination = parsedTimestamp ? new Date(parsedTimestamp) : null;
  const validOrigination = parsedOrigination && !Number.isNaN(parsedOrigination.getTime());
  const paymentDateFormatted = validOrigination
    ? parsedOrigination!.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

  const emailCommon = {
    amount,
    paymentType: updatedPayment.type || "Other",
    transactionId: updatedPayment.transactionId || update.id,
    paymentDate: paymentDateFormatted,
    mpesaCode: reference || undefined,
  };

  try {
    await sendConfirmationEmail({
      to: tenant.email,
      name: tenant.name,
      propertyName: property.name,
      ...emailCommon,
    });
  } catch (emailError) {
    logger.error("Failed to send payment confirmation email to tenant", {
      tenantId: updatedPayment.tenantId,
      message: emailError instanceof Error ? emailError.message : String(emailError),
    });
  }

  if (tenant.phone) {
    try {
      const smsText = `Payment of Ksh. ${amount} for ${property.name} (${updatedPayment.type || "Other"}) confirmed on ${paymentDateFormatted}. Ref: ${reference || updatedPayment.transactionId || update.id}`;
      await sendWelcomeSms({ phone: tenant.phone, message: smsText });
    } catch (smsError) {
      logger.error("Failed to send payment confirmation SMS to tenant", {
        tenantId: updatedPayment.tenantId,
        message: smsError instanceof Error ? smsError.message : String(smsError),
      });
    }
  }

  if (owner) {
    try {
      await sendConfirmationEmail({
        to: owner.email,
        name: owner.name,
        propertyName: property.name,
        tenantName: tenant.name,
        ...emailCommon,
      });
    } catch (emailError) {
      logger.error("Failed to send payment confirmation email to owner", {
        ownerId: property.ownerId,
        message: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    if (owner.phone) {
      try {
        const smsText = `Payment of Ksh. ${amount} by ${tenant.name} for ${property.name} (${updatedPayment.type || "Other"}) confirmed on ${paymentDateFormatted}. Ref: ${reference || updatedPayment.transactionId || update.id}`;
        await sendWelcomeSms({ phone: owner.phone, message: smsText });
      } catch (smsError) {
        logger.error("Failed to send payment confirmation SMS to owner", {
          ownerId: property.ownerId,
          message: smsError instanceof Error ? smsError.message : String(smsError),
        });
      }
    }
  }

  return { payment: updatedPayment, normalizedStatus };
}
