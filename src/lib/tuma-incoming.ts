// src/lib/tuma-incoming.ts
import { Db, ObjectId } from "mongodb";
import logger from "@/lib/logger";
import { calculateTenantRentDueToDate, calculateWalletBalanceFromPayments } from "@/lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { getTenantPaymentTotals } from "@/lib/payment-totals";
import { sendAirbnbPaymentReceivedEmail, sendConfirmationEmail } from "@/lib/email";
import { sendWelcomeSms } from "@/lib/sms";

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
  const trimmed = timestamp.trim();
  if (!trimmed) return null;

  const direct = new Date(trimmed);
  if (!Number.isNaN(direct.getTime())) {
    return direct.toISOString();
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
}): Promise<{ payment: any; normalizedStatus: string }> {
  const { db, payment } = params;
  const update = params.update;
  const normalizedStatus = normalizeTumaStatus(update);
  const prevStatus = payment.status;

  const patch: Record<string, any> = {};
  if (normalizedStatus && normalizedStatus !== payment.status) {
    patch.status = normalizedStatus;
  }

  const reference = update.mpesaReceiptNumber || update.reference || "";
  if (normalizedStatus === "completed" && reference && isLikelyMpesaReceipt(reference)) {
    patch.mpesaCode = reference;
  }

  const parsedTimestamp = parseTimestamp(update.timestamp);
  if (parsedTimestamp) {
    patch.paymentDate = parsedTimestamp;
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

  if (prevStatus === "completed" && normalizedStatus === "completed") {
    return { payment: updatedPayment, normalizedStatus };
  }

  if (params.skipNonTerminalSideEffects && normalizedStatus === "pending_stk") {
    return { payment: updatedPayment, normalizedStatus };
  }

  if (updatedPayment.invoiceId && ObjectId.isValid(updatedPayment.invoiceId)) {
    await db.collection("invoices").updateOne(
      { _id: new ObjectId(updatedPayment.invoiceId) },
      {
        $set: {
          status: normalizedStatus === "completed" ? "completed" : "failed",
          updatedAt: new Date().toISOString(),
        },
      }
    );
  }

  if (updatedPayment.airbnbBookingId) {
    await db.collection("airbnbBookings").updateOne(
      { externalId: updatedPayment.airbnbBookingId, ownerId: updatedPayment.ownerId },
      {
        $set: {
          payoutStatus:
            normalizedStatus === "completed"
              ? "paid"
              : normalizedStatus === "failed"
                ? "failed"
                : "pending",
          updatedAt: new Date().toISOString(),
        },
      }
    );

    if (normalizedStatus === "completed") {
      const booking = await db.collection("airbnbBookings").findOne({
        externalId: updatedPayment.airbnbBookingId,
        ownerId: updatedPayment.ownerId,
      });
      const settings = await db.collection("airbnbSettings").findOne({ ownerId: updatedPayment.ownerId });
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

    if (normalizedStatus === "completed" && updatedPayment.airbnbTenantId && ObjectId.isValid(updatedPayment.airbnbTenantId)) {
      await db.collection("tenants").updateOne(
        { _id: new ObjectId(updatedPayment.airbnbTenantId), accountType: "airbnb_guest" },
        { $set: { status: "inactive", updatedAt: new Date().toISOString() } }
      );
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

  const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, [tenant.propertyId]);
  const { rentDue: totalRentDue } = calculateTenantRentDueToDate({
    tenant: tenant as any,
    today: new Date(),
    rentOverrideMap,
  });

  const paymentTotals = await getTenantPaymentTotals(db, updatedPayment.tenantId);
  const amount = update.amount || updatedPayment.amount || 0;
  const depositTotal =
    tenant.leasedUnits && tenant.leasedUnits.length > 0
      ? tenant.leasedUnits.reduce((sum: number, unit: any) => sum + (unit.deposit || 0), 0)
      : (tenant.deposit ?? tenant.requiredDeposit ?? tenant.price ?? 0);
  const rentDueAfter = Math.max(0, totalRentDue - paymentTotals.rentPaid);
  const depositDueAfter = Math.max(0, depositTotal - paymentTotals.depositPaid);
  const utilityDueAfter = 0;
  const walletBalance = calculateWalletBalanceFromPayments({
    rentPaid: paymentTotals.rentPaid,
    depositPaid: paymentTotals.depositPaid,
    utilityPaid: paymentTotals.utilityPaid,
    rentDue: totalRentDue,
    depositDue: depositTotal,
    utilityDue: 0,
  });
  const totalRemainingDues = rentDueAfter + depositDueAfter + utilityDueAfter;

  await db.collection("tenants").updateOne(
    { _id: new ObjectId(updatedPayment.tenantId) },
    {
      $set: {
        totalRentPaid: paymentTotals.rentPaid,
        totalUtilityPaid: paymentTotals.utilityPaid,
        totalDepositPaid: paymentTotals.depositPaid,
        walletBalance,
        paymentStatus: totalRemainingDues > 0 ? "overdue" : "up-to-date",
        updatedAt: new Date().toISOString(),
      },
    }
  );

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
