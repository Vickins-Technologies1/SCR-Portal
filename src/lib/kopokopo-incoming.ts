// src/lib/kopokopo-incoming.ts
import { Db, ObjectId } from "mongodb";
import logger from "@/lib/logger";
import { calculateTenantRentDueToDate, calculateWalletBalanceFromPayments } from "@/lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { getTenantPaymentTotals } from "@/lib/payment-totals";
import { sendAirbnbPaymentReceivedEmail, sendConfirmationEmail } from "@/lib/email";
import { sendWelcomeSms } from "@/lib/sms";

export type KopoKopoIncomingUpdate = {
  id: string;
  status?: string;
  resourceStatus?: string;
  errors?: string;
  reference?: string;
  amount?: number;
  phoneNumber?: string;
  originationTime?: string;
};

export function isLikelyMpesaReceipt(reference?: string): boolean {
  if (!reference) return false;
  const trimmed = reference.trim();
  return /^[A-Z0-9]{10}$/i.test(trimmed);
}

export function normalizeKopoStatus(params: {
  status?: string;
  resourceStatus?: string;
  errors?: string;
}) {
  const status = String(params.status || "").toLowerCase();
  const resourceStatus = String(params.resourceStatus || "").toLowerCase();
  const errorsLower = String(params.errors || "").toLowerCase();

  const successTokens = new Set(["success", "received"]);
  const statusTokens = [status, resourceStatus].filter(Boolean);
  const isCompleted = statusTokens.some((value) => successTokens.has(value));
  const isCancelled =
    statusTokens.some((value) => value === "cancelled" || value === "canceled") ||
    errorsLower.includes("cancel");
  const isFailed =
    statusTokens.some((value) => value === "failed") ||
    errorsLower.includes("timeout") ||
    errorsLower.includes("expired");
  return isCompleted ? "completed" : isCancelled ? "cancelled" : isFailed ? "failed" : "pending_stk";
}

export async function applyKopokopoPaymentUpdate(params: {
  db: Db;
  payment: any;
  update: KopoKopoIncomingUpdate;
  skipNonTerminalSideEffects?: boolean;
}): Promise<{ payment: any; normalizedStatus: string }> {
  const { db, payment } = params;
  const update = params.update;
  const normalizedStatus = normalizeKopoStatus(update);
  const prevStatus = payment.status;

  const patch: Record<string, any> = {};
  if (normalizedStatus && normalizedStatus !== payment.status) {
    patch.status = normalizedStatus;
  }
  if (normalizedStatus === "completed" && update.reference && isLikelyMpesaReceipt(update.reference)) {
    patch.mpesaCode = update.reference;
  }
  if (update.originationTime) {
    const parsed = new Date(update.originationTime);
    if (!Number.isNaN(parsed.getTime())) {
      patch.paymentDate = parsed.toISOString();
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
        const parsedOrigination = update.originationTime ? new Date(update.originationTime) : null;
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
            reference: update.reference || updatedPayment.transactionId || update.id,
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

  const parsedOrigination = update.originationTime ? new Date(update.originationTime) : null;
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
    mpesaCode: update.reference || undefined,
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
      const smsText = `Payment of Ksh. ${amount} for ${property.name} (${updatedPayment.type || "Other"}) confirmed on ${paymentDateFormatted}. Ref: ${update.reference || updatedPayment.transactionId || update.id}`;
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
        const smsText = `Payment of Ksh. ${amount} by ${tenant.name} for ${property.name} (${updatedPayment.type || "Other"}) confirmed on ${paymentDateFormatted}. Ref: ${update.reference || updatedPayment.transactionId || update.id}`;
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
