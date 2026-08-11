// src/app/api/mpesa/stk-callback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId, Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { calculateTenantRentDueToDate, calculateWalletBalanceFromPayments, resolveTenantRequiredDeposit } from "@/lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { getTenantPaymentTotals } from "@/lib/payment-totals";
import { calculateFixedUtilityDue, getPostedMeteredUtilityTotal } from "@/lib/property-utilities";
import { sendAirbnbPaymentReceivedEmail, sendConfirmationEmail } from "@/lib/email";
import { sendWelcomeSms } from "@/lib/sms";
import { syncAirbnbBookingPaymentStatus } from "@/lib/airbnb-payments";
import { diffNights, parseDate } from "@/lib/airbnb-utils";

const CallbackSchema = z.object({
  Body: z.object({
    stkCallback: z.object({
      MerchantRequestID: z.string(),
      CheckoutRequestID: z.string(),
      ResultCode: z.number(),
      ResultDesc: z.string(),
      CallbackMetadata: z
        .object({
          Item: z.array(
            z.object({
              Name: z.string(),
              Value: z.union([z.string(), z.number()]).optional(),
            })
          ),
        })
        .optional(),
    }),
  }),
});

function parseMpesaDate(value?: string | number): Date {
  if (!value) return new Date();
  const str = String(value);
  if (!/^\d{14}$/.test(str)) return new Date();
  const year = str.slice(0, 4);
  const month = str.slice(4, 6);
  const day = str.slice(6, 8);
  const hour = str.slice(8, 10);
  const minute = str.slice(10, 12);
  const second = str.slice(12, 14);
  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}+03:00`);
}

function extractMetadata(items?: { Name: string; Value?: string | number }[]) {
  const map = new Map<string, string | number>();
  items?.forEach((item) => {
    if (item?.Name) map.set(item.Name, item.Value ?? "");
  });
  return {
    amount: Number(map.get("Amount") || 0),
    receipt: String(map.get("MpesaReceiptNumber") || ""),
    transactionDate: map.get("TransactionDate"),
    phone: String(map.get("PhoneNumber") || ""),
  };
}

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid JSON" }, { status: 400 });
  }

  const parsed = CallbackSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payload" }, { status: 400 });
  }

  const callback = parsed.data.Body.stkCallback;
  const metadata = extractMetadata(callback.CallbackMetadata?.Item);

  const status =
    callback.ResultCode === 0
      ? "completed"
      : /cancel/i.test(callback.ResultDesc) || callback.ResultCode === 1032
      ? "cancelled"
      : "failed";

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const paymentQuery = {
      $or: [
        { checkoutRequestId: callback.CheckoutRequestID },
        { transactionId: callback.CheckoutRequestID },
        { merchantRequestId: callback.MerchantRequestID },
      ],
    };

    const existingPayment = await db.collection("payments").findOne(paymentQuery);
    if (!existingPayment) {
      logger.warn("STK callback received but payment not found", {
        checkoutRequestId: callback.CheckoutRequestID,
      });
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
    }

    const wasAlreadyCompleted = String(existingPayment.status || "").toLowerCase() === "completed";
    const sameReceipt = !metadata.receipt || metadata.receipt === existingPayment.mpesaCode;

    if (wasAlreadyCompleted && sameReceipt && status === "completed") {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
    }

    // Match payment by CheckoutRequestID/MerchantRequestID
    const paymentResult = await db.collection("payments").findOneAndUpdate(
      paymentQuery,
      {
        $set: {
          status,
          ...(metadata.amount ? { amount: metadata.amount } : {}),
          mpesaCode: metadata.receipt || null,
          paymentDate: parseMpesaDate(metadata.transactionDate).toISOString(),
          phoneNumber: metadata.phone || undefined,
        },
      },
      { returnDocument: "after" }
    );

    const payment = paymentResult?.value;

    // If we have an invoice, mark it paid/failed for reporting
    if (payment.invoiceId && ObjectId.isValid(payment.invoiceId)) {
      await db.collection("invoices").updateOne(
        { _id: new ObjectId(payment.invoiceId) },
        { $set: { status: status === "completed" ? "completed" : "failed", updatedAt: new Date().toISOString() } }
      );
    }

    // Handle Airbnb direct booking payments
    if (payment.airbnbBookingId) {
      const nowIso = new Date().toISOString();
      const bookingId = String(payment.airbnbBookingId);
      const ownerId = String(payment.ownerId || "");

      const sync = await syncAirbnbBookingPaymentStatus(db, { ownerId, bookingId, nowIso });

      if (status === "completed") {
        // Guest portal stays active through the stay (controlled by expiresAt),
        // so we do not deactivate Airbnb guest tenant accounts on payment completion.
        if (sync?.payoutStatus === "paid") {
          const pendingExtension = await db
            .collection("airbnbStayExtensions")
            .findOne({ ownerId, bookingId, status: "pending_payment" }, { sort: { createdAt: -1, _id: -1 } });

          if (pendingExtension?.requestedCheckOut) {
            const bookingDoc = await db.collection("airbnbBookings").findOne({ ownerId, externalId: bookingId });
            const checkIn = parseDate(bookingDoc?.checkIn) || new Date();
            const requestedCheckOut = parseDate(pendingExtension.requestedCheckOut);

            if (requestedCheckOut && bookingDoc) {
              const nights = diffNights(checkIn, requestedCheckOut);

              await db.collection("airbnbBookings").updateOne(
                { ownerId, externalId: bookingId },
                {
                  $set: {
                    checkOut: requestedCheckOut.toISOString(),
                    nights,
                    updatedAt: nowIso,
                  },
                }
              );

              const extendedExpiresAt = new Date(requestedCheckOut.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
              await db.collection("tenants").updateMany(
                { ownerId, accountType: "airbnb_guest", airbnbBookingId: bookingId },
                {
                  $set: {
                    leaseEndDate: requestedCheckOut.toISOString(),
                    expiresAt: extendedExpiresAt,
                    status: "active",
                    updatedAt: nowIso,
                  },
                }
              );

              await db.collection("airbnbStayExtensions").updateOne(
                { _id: pendingExtension._id },
                { $set: { status: "active", activatedAt: nowIso, updatedAt: nowIso } }
              );
            }
          }
        }

        const booking = await db.collection("airbnbBookings").findOne({
          externalId: bookingId,
          ownerId,
        });
        const settings = await db.collection("airbnbSettings").findOne({ ownerId });
        if (booking?.guestEmail && settings?.sendPaymentReceipt !== false) {
          try {
            await sendAirbnbPaymentReceivedEmail({
              to: booking.guestEmail,
              guestName: booking.guestName || "Guest",
              listingName: booking.listingName || "Airbnb Stay",
              amount: metadata.amount || payment.amount || 0,
              paymentDate: new Date().toLocaleDateString("en-KE", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              }),
              reference: metadata.receipt || callback.CheckoutRequestID,
              supportEmail: settings?.supportEmail,
            });
          } catch (emailError) {
            logger.error("Failed to send Airbnb payment receipt email", {
              bookingId: booking.externalId,
              message: emailError instanceof Error ? emailError.message : String(emailError),
            });
          }
        }
      }
    }

    // Only complete downstream ledger updates for successful tenant payments
    if (status !== "completed" || !payment.tenantId) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
    }

    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(payment.tenantId) });
    if (!tenant) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
    }

    const property = await db.collection("properties").findOne({ _id: new ObjectId(payment.propertyId) });
    if (!property) {
      return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
    }

    const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, [tenant.propertyId]);
    const { rentDue: totalRentDue } = calculateTenantRentDueToDate({
      tenant: tenant as any,
      today: new Date(),
      rentOverrideMap,
    });

    const paymentTotals = await getTenantPaymentTotals(db, payment.tenantId);
    const amount = metadata.amount || payment.amount || 0;
    const depositTotal = resolveTenantRequiredDeposit({
      tenant: tenant as any,
      unitTypes: (property as any)?.unitTypes,
    });
    const rentDueAfter = Math.max(0, totalRentDue - paymentTotals.rentPaid);
    const depositDueAfter = Math.max(0, depositTotal - paymentTotals.depositPaid);
    const utilityDueAfter =
      calculateFixedUtilityDue({ utilities: (property as any)?.utilities, tenant: tenant as any, today: new Date() }) +
      (await getPostedMeteredUtilityTotal(db, payment.tenantId));
    const walletBalance = calculateWalletBalanceFromPayments({
      rentPaid: paymentTotals.rentPaid,
      depositPaid: paymentTotals.depositPaid,
      utilityPaid: paymentTotals.utilityPaid,
      rentDue: totalRentDue,
      depositDue: depositTotal,
      utilityDue: utilityDueAfter,
    });
    const totalRemainingDues = rentDueAfter + depositDueAfter + utilityDueAfter;

    await db.collection("tenants").updateOne(
      { _id: new ObjectId(payment.tenantId) },
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

    const paymentDateFormatted = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const emailCommon = {
      amount,
      paymentType: payment.type || "Other",
      transactionId: callback.CheckoutRequestID,
      paymentDate: paymentDateFormatted,
      mpesaCode: metadata.receipt || undefined,
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
        tenantId: payment.tenantId,
        message: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    if (tenant.phone) {
      try {
        const smsText = `Payment of Ksh. ${amount} for ${property.name} (${payment.type || "Other"}) confirmed on ${paymentDateFormatted}. Ref: ${metadata.receipt || callback.CheckoutRequestID}`;
        await sendWelcomeSms({ phone: tenant.phone, message: smsText });
      } catch (smsError) {
        logger.error("Failed to send payment confirmation SMS to tenant", {
          tenantId: payment.tenantId,
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
          const smsText = `Payment of Ksh. ${amount} by ${tenant.name} for ${property.name} (${payment.type || "Other"}) confirmed on ${paymentDateFormatted}. Ref: ${metadata.receipt || callback.CheckoutRequestID}`;
          await sendWelcomeSms({ phone: owner.phone, message: smsText });
        } catch (smsError) {
          logger.error("Failed to send payment confirmation SMS to owner", {
            ownerId: property.ownerId,
            message: smsError instanceof Error ? smsError.message : String(smsError),
          });
        }
      }
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
  } catch (error) {
    logger.error("STK callback processing error", {
      message: error instanceof Error ? error.message : String(error),
      checkoutRequestId: callback.CheckoutRequestID,
    });
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" }, { status: 200 });
  }
}
