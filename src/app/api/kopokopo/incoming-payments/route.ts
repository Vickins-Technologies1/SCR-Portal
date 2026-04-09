// src/app/api/kopokopo/incoming-payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { calculateTenantRentDueToDate, calculateWalletBalanceFromPayments } from "@/lib/utils";
import { fetchActiveRentOverridesByPropertyIds } from "@/lib/rent-overrides";
import { getTenantPaymentTotals } from "@/lib/payment-totals";
import { sendAirbnbPaymentReceivedEmail, sendConfirmationEmail } from "@/lib/email";
import { sendWelcomeSms } from "@/lib/sms";

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  if (signature.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

function isLikelyMpesaReceipt(reference?: string): boolean {
  if (!reference) return false;
  const trimmed = reference.trim();
  return /^[A-Z0-9]{10}$/i.test(trimmed);
}

export async function POST(request: NextRequest) {
  const apiKey = (process.env.KOPOKOPO_API_KEY || "").trim();
  const fallbackSecret = (process.env.KOPOKOPO_CLIENT_SECRET || "").trim();
  const secret = apiKey || fallbackSecret;
  const signature = request.headers.get("x-kopokopo-signature");

  const bodyText = await request.text();
  if (!secret) {
    logger.error("Missing KopoKopo webhook secret. Set KOPOKOPO_API_KEY.");
    return NextResponse.json({ success: false, message: "Webhook not configured" }, { status: 500 });
  }
  if (!signature) {
    logger.error("Missing KopoKopo signature");
    return NextResponse.json({ success: false, message: "Missing signature" }, { status: 401 });
  }
  if (!verifySignature(bodyText, signature, secret)) {
    logger.error("Invalid KopoKopo signature", { signature });
    return NextResponse.json({ success: false, message: "Invalid signature" }, { status: 401 });
  }
  if (!apiKey) {
    logger.warn("KOPOKOPO_API_KEY missing; using client secret for webhook verification.");
  }

  let payload: any;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const data = payload?.data;
  const id = data?.id ? String(data.id) : "";
  const attributes = data?.attributes || {};
  const eventResource = attributes?.event?.resource || {};

  const status = String(attributes?.status || "").toLowerCase();
  const resourceStatus = String(eventResource?.status || "").toLowerCase();
  const eventErrors = attributes?.event?.errors;
  const errorsLower = (Array.isArray(eventErrors) ? eventErrors.join("; ") : eventErrors || "")
    .toString()
    .toLowerCase();
  const reference = eventResource?.reference ? String(eventResource.reference) : "";
  const senderPhone = eventResource?.sender_phone_number ? String(eventResource.sender_phone_number) : "";
  const amountValue = eventResource?.amount ? Number(eventResource.amount) : undefined;
  const originationTime = eventResource?.origination_time ? String(eventResource.origination_time) : "";
  const parsedOrigination = originationTime ? new Date(originationTime) : null;
  const originationIso =
    parsedOrigination && !Number.isNaN(parsedOrigination.getTime()) ? parsedOrigination.toISOString() : originationTime;

  if (!id) {
    return NextResponse.json({ success: false, message: "Missing incoming payment id" }, { status: 400 });
  }

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
  const normalizedStatus = isCompleted ? "completed" : isCancelled ? "cancelled" : isFailed ? "failed" : "pending_stk";

  try {
    const { db } = await connectToDatabase();
    const receivedAt = new Date().toISOString();
    const rawBody =
      bodyText.length > 4000 ? `${bodyText.slice(0, 4000)}…(truncated)` : bodyText;

    let webhookId: ObjectId | null = null;
    try {
      const webhookInsert = await db.collection("kopokopoWebhooks").insertOne({
        receivedAt,
        incomingPaymentId: id,
        status,
        resourceStatus,
        reference,
        amount: amountValue,
        phoneNumber: senderPhone,
        originationTime: originationIso,
        signatureValid: true,
        rawBody,
      });
      webhookId = webhookInsert.insertedId;
    } catch (insertError) {
      logger.error("Failed to log KopoKopo webhook", {
        message: insertError instanceof Error ? insertError.message : String(insertError),
        id,
      });
    }
    const payment = await db.collection("payments").findOne({
      $or: [
        { kopokopoIncomingPaymentId: id },
        { transactionId: id },
        { checkoutRequestId: id },
        { merchantRequestId: id },
        ...(reference ? [{ reference }] : []),
      ],
    });

    if (!payment) {
      logger.error("KopoKopo callback payment not found", { id, reference });
      if (webhookId) {
        await db.collection("kopokopoWebhooks").updateOne(
          { _id: webhookId },
          { $set: { paymentMatched: false } }
        );
      }
      return NextResponse.json({ success: true });
    }

    const prevStatus = payment.status;
    const referenceValid = isLikelyMpesaReceipt(reference);

    const update: Record<string, any> = { status: normalizedStatus };
    if (isCompleted && referenceValid) {
      update.mpesaCode = reference;
    }
    if (originationIso) update.paymentDate = originationIso;

    await db.collection("payments").updateOne({ _id: payment._id }, { $set: update });
    if (webhookId) {
      await db.collection("kopokopoWebhooks").updateOne(
        { _id: webhookId },
        {
          $set: {
            paymentMatched: true,
            paymentId: payment._id.toString(),
            paymentStatus: update.status,
            tenantId: payment.tenantId ?? null,
            landlordId: payment.landlordId ?? null,
          },
        }
      );
    }

    if (prevStatus === "completed" && normalizedStatus === "completed") {
      return NextResponse.json({ success: true });
    }

    // If we have an invoice, mark it paid/failed for reporting
    if (payment.invoiceId && ObjectId.isValid(payment.invoiceId)) {
      await db.collection("invoices").updateOne(
        { _id: new ObjectId(payment.invoiceId) },
        { $set: { status: normalizedStatus === "completed" ? "completed" : "failed", updatedAt: new Date().toISOString() } }
      );
    }

    if (payment.airbnbBookingId) {
      await db.collection("airbnbBookings").updateOne(
        { externalId: payment.airbnbBookingId, ownerId: payment.ownerId },
        {
          $set: {
            payoutStatus: normalizedStatus === "completed" ? "paid" : normalizedStatus === "failed" ? "failed" : "pending",
            updatedAt: new Date().toISOString(),
          },
        }
      );

      if (normalizedStatus === "completed") {
        const booking = await db.collection("airbnbBookings").findOne({
          externalId: payment.airbnbBookingId,
          ownerId: payment.ownerId,
        });
        const settings = await db.collection("airbnbSettings").findOne({ ownerId: payment.ownerId });
        if (booking?.guestEmail && settings?.sendPaymentReceipt !== false) {
          try {
            await sendAirbnbPaymentReceivedEmail({
              to: booking.guestEmail,
              guestName: booking.guestName || "Guest",
              listingName: booking.listingName || "Airbnb Stay",
              amount: amountValue || payment.amount || 0,
              paymentDate: parsedOrigination && !Number.isNaN(parsedOrigination.getTime())
                ? parsedOrigination.toLocaleDateString("en-KE", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : new Date().toLocaleDateString("en-KE"),
              reference,
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
    if (normalizedStatus !== "completed" || !payment.tenantId) {
      return NextResponse.json({ success: true });
    }

    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(payment.tenantId) });
    if (!tenant) {
      return NextResponse.json({ success: true });
    }

    const property = await db.collection("properties").findOne({ _id: new ObjectId(payment.propertyId) });
    if (!property) {
      return NextResponse.json({ success: true });
    }

    const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(db, [tenant.propertyId]);
    const { rentDue: totalRentDue } = calculateTenantRentDueToDate({
      tenant: tenant as any,
      today: new Date(),
      rentOverrideMap,
    });

    const paymentTotals = await getTenantPaymentTotals(db, payment.tenantId);
    const amount = amountValue || payment.amount || 0;
    const depositTotal = tenant.leasedUnits && tenant.leasedUnits.length > 0
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

    const paymentDateFormatted =
      parsedOrigination && !Number.isNaN(parsedOrigination.getTime())
        ? parsedOrigination.toLocaleDateString("en-US", {
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
      paymentType: payment.type || "Other",
      transactionId: payment.transactionId || id,
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
        tenantId: payment.tenantId,
        message: emailError instanceof Error ? emailError.message : String(emailError),
      });
    }

    if (tenant.phone) {
      try {
        const smsText = `Payment of Ksh. ${amount} for ${property.name} (${payment.type || "Other"}) confirmed on ${paymentDateFormatted}. Ref: ${reference || id}`;
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
          const smsText = `Payment of Ksh. ${amount} by ${tenant.name} for ${property.name} (${payment.type || "Other"}) confirmed on ${paymentDateFormatted}. Ref: ${reference || id}`;
          await sendWelcomeSms({ phone: owner.phone, message: smsText });
        } catch (smsError) {
          logger.error("Failed to send payment confirmation SMS to owner", {
            ownerId: property.ownerId,
            message: smsError instanceof Error ? smsError.message : String(smsError),
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("KopoKopo callback error", {
      message: error instanceof Error ? error.message : String(error),
      id,
      reference,
    });
    return NextResponse.json({ success: true });
  }
}
