// src/app/api/tenants/resend-welcome/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import crypto from "crypto";

import { validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";

import { sendPasswordResetEmail } from "@/lib/email";
import { sendWelcomeSms } from "@/lib/sms";
import { sendWhatsAppMessage } from "@/lib/whatsapp";  // ← NEW import

export async function POST(request: NextRequest) {
  // CSRF validation
  const csrfHeader = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfHeader)) {
    logger.warn("Invalid CSRF token in /api/tenants/resend-welcome");
    return NextResponse.json(
      { success: false, message: "Invalid CSRF token" },
      { status: 403 }
    );
  }

  // Parse body
  let tenantId: string;
  try {
    const body = await request.json();
    tenantId = body.tenantId;

    if (!tenantId || !ObjectId.isValid(tenantId)) {
      return NextResponse.json(
        { success: false, message: "Valid tenantId is required" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid request body" },
      { status: 400 }
    );
  }

  try {
    const { db } = await connectToDatabase();

    const tenant = await db.collection("tenants").findOne({
      _id: new ObjectId(tenantId),
      // ownerId: userId   ← optional: add back if you want strict ownership check
    });

    if (!tenant) {
      return NextResponse.json(
        { success: false, message: "Tenant not found or access denied" },
        { status: 404 }
      );
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.collection("passwordResets").insertOne({
      tenantId: tenant._id,
      role: "tenant",
      email: tenant.email,
      token: resetToken,
      expiresAt,
      used: false,
      createdAt: new Date(),
    });

    // Build reset link
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
    const resetLink = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(
      tenant.email
    )}`;

    const propertyId = tenant.propertyId;
    const property = propertyId && ObjectId.isValid(propertyId)
      ? await db.collection("properties").findOne({ _id: new ObjectId(propertyId) })
      : null;

    const propertyName = property?.name || tenant.propertyName || "your property";
    const unitSummary =
      Array.isArray(tenant.leasedUnits) && tenant.leasedUnits.length > 0
        ? tenant.leasedUnits
            .map((unit: any) => unit.houseNumber || unit.unitType || unit.unitIdentifier)
            .filter(Boolean)
            .join(", ")
        : (tenant.houseNumber || tenant.unitType || tenant.unitIdentifier || "N/A");

    // ────────────────────────────────────────────────
    //  Prepare full SMS message (auto-split into multi-part if needed)
    // ────────────────────────────────────────────────
    const smsMessage =
      `Hello ${tenant.name},\n` +
      `Reset your tenant portal password using this link (expires in 1 hour):\n` +
      `${resetLink}\n` +
      `Property: ${propertyName}\n` +
      `Unit(s): ${unitSummary}\n` +
      `If you did not request this, contact your property manager.`;

    // ────────────────────────────────────────────────
    //  Prepare longer WhatsApp message (up to 4096 chars)
    // ────────────────────────────────────────────────
    const whatsappMessage = 
      `Hello ${tenant.name},\n\n` +
      `A secure link has been generated for you to set or reset your password for your tenant account.\n\n` +
      `Click here: ${resetLink}\n\n` +
      `This link expires in 1 hour.\n` +
      `Property: ${propertyName}\n` +
      `Unit/House: ${unitSummary}\n\n` +
      `If you did not request this, please contact your property manager immediately.\n\n` +
      `Best regards,\nSorana Property Managers Ltd.`;

    // ────────────────────────────────────────────────
    //  Send EMAIL
    // ────────────────────────────────────────────────
    let emailSent = false;
    try {
      await sendPasswordResetEmail({
        to: tenant.email,
        name: tenant.name,
        resetLink,
        propertyName: tenant.propertyName || "the property",
        houseNumber: tenant.houseNumber || "",
      });
      emailSent = true;
      logger.info("Password reset email sent", {
        tenantId: tenant._id.toString(),
        email: tenant.email
      });
    } catch (emailErr: any) {
      logger.error("Failed to send password reset email", {
        tenantId: tenant._id.toString(),
        error: emailErr.message,
      });
    }

    // ────────────────────────────────────────────────
    //  Send SMS
    // ────────────────────────────────────────────────
    let smsSent = false;
    try {
      await sendWelcomeSms({
        phone: tenant.phone,
        message: smsMessage,
      });
      smsSent = true;
      logger.info("Password reset SMS sent", {
        tenantId: tenant._id.toString(),
        phone: tenant.phone
      });
    } catch (smsErr: any) {
      logger.error("Failed to send password reset SMS", {
        tenantId: tenant._id.toString(),
        phone: tenant.phone,
        error: smsErr.message,
      });
    }

    // ────────────────────────────────────────────────
    //  Send WhatsApp
    // ────────────────────────────────────────────────
    let whatsappSent = false;
    try {
      const result = await sendWhatsAppMessage({
        phone: tenant.phone,
        message: whatsappMessage,
      });

      if (result.success) {
        whatsappSent = true;
        logger.info("Password reset WhatsApp sent", {
          tenantId: tenant._id.toString(),
          phone: tenant.phone
        });
      } else {
        logger.error("WhatsApp send failed", {
          tenantId: tenant._id.toString(),
          phone: tenant.phone,
          error: result.error
        });
      }
    } catch (whatsappErr: any) {
      logger.error("Failed to send password reset WhatsApp", {
        tenantId: tenant._id.toString(),
        phone: tenant.phone,
        error: whatsappErr.message,
      });
    }

    // ────────────────────────────────────────────────
    //  Final response
    // ────────────────────────────────────────────────
    if (!emailSent && !smsSent && !whatsappSent) {
      return NextResponse.json(
        { success: false, message: "Failed to send reset link via any channel (email, SMS, WhatsApp)" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password reset link sent" +
        (emailSent ? " via email" : "") +
        (smsSent ? `${emailSent ? "," : ""} via SMS` : "") +
        (whatsappSent ? `${emailSent || smsSent ? "," : ""} via WhatsApp` : ""),
      delivery: {
        email: emailSent ? "sent" : "failed",
        sms: smsSent ? "sent" : "failed",
        whatsapp: whatsappSent ? "sent" : "failed",
      },
    });
  } catch (err: any) {
    logger.error("Error in resend-welcome endpoint", {
      tenantId,
      error: err.message,
      stack: err.stack,
    });

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
