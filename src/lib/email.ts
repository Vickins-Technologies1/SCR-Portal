'use server';

import nodemailer from "nodemailer";
import { generateStyledTemplate } from "./email-template";

interface WelcomeEmailOptions {
  to: string;
  name: string;
  email: string;
  password: string;
  loginUrl: string;
  propertyName: string;
  houseNumber: string;
}

interface UpdateEmailOptions {
  to: string;
  name: string;
  email: string;
  propertyName?: string;
  houseNumber?: string;
}

interface ReminderEmailOptions {
  to: string;
  name: string;
  propertyName: string;
  houseNumber: string;
  rentDue: number;
  utilityDue: number;
  depositDue: number;
  totalDue: number;
  dueDate: string;
  reminderType: "fiveDaysBefore" | "paymentDate";
}

interface InvoiceEmailOptions {
  to: string;
  ownerName: string;
  propertyName: string;
  amount: number;
  dueDate: string;
  reminderType: "fiveDaysBefore" | "dueDate" | "manual";
  dashboardUrl: string;
  invoiceNumber: string;
  pdfBytes?: Uint8Array | Buffer;
}

interface ConfirmationEmailOptions {
  to: string;
  name: string;
  propertyName: string;
  amount: number;
  paymentType: string;
  transactionId: string;
  paymentDate: string;
  tenantName?: string;       // Used when sending to property owner
  mpesaCode?: string;        // M-Pesa receipt / reference number
}

interface VacateRequestEmailOptions {
  to: string;
  ownerName: string;
  tenantName: string;
  propertyName: string;
  houseNumber?: string;
  moveOutDate?: string;
  message: string;
  dashboardUrl: string;
}

interface TenantDeletionRequestEmailOptions {
  to: string;
  ownerName: string;
  tenantName: string;
  propertyName: string;
  houseNumber?: string;
  unitType?: string;
  requestedBy: string;
  dashboardUrl: string;
}

interface ResetEmailOptions {
  to: string;
  name: string;
  resetLink: string;
  propertyName?: string;
  houseNumber?: string;
}

interface OwnerResetEmailOptions {
  to: string;
  name: string;
  resetLink: string;
}

interface OtpEmailOptions {
  to: string;
  name: string;
  code: string;
}

interface AirbnbGuestMessageOptions {
  to: string;
  guestName: string;
  listingName: string;
  message: string;
  subject?: string;
}

interface AirbnbBookingEmailOptions {
  to: string;
  guestName: string;
  listingName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  supportEmail?: string;
  bookingReference?: string;
  bookingStatus?: "pending_verification" | "confirmed";
  hostName?: string;
  hostPhone?: string;
  paymentMethod?: string;
  mpesaCode?: string;
}

interface AirbnbPaymentEmailOptions {
  to: string;
  guestName: string;
  listingName: string;
  amount: number;
  paymentDate: string;
  reference?: string;
  supportEmail?: string;
}

interface AirbnbPaymentPortalInviteOptions {
  to: string;
  guestName: string;
  listingName: string;
  bookingId: string;
  amount: number;
  loginUrl: string;
  paymentUrl: string;
  email: string;
  password: string;
  supportEmail?: string;
}

interface AirbnbReminderEmailOptions {
  to: string;
  guestName: string;
  listingName: string;
  date: string;
  supportEmail?: string;
  type: "checkin" | "checkout";
}

// Reusable transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface ContactLeadEmailOptions {
  to: string;
  name: string;
  email?: string;
  phone?: string;
  subject?: string;
  message: string;
  meta?: {
    id?: string;
    createdAt?: string;
    ip?: string;
    origin?: string;
    referer?: string;
    userAgent?: string;
  };
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return char;
    }
  });


export async function sendWelcomeEmail({
  to,
  name,
  email,
  password,
  loginUrl,
  propertyName,
  houseNumber,
}: WelcomeEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const html = generateStyledTemplate({
      name,
      title: "Welcome to Your New Home!",
      intro: "Your tenant account has been successfully created. Below are your login details.",
      details: `
        <ul>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Temporary Password:</strong> ${password}</li>
          <li><strong>Login:</strong> <a href="${loginUrl}" class="button">Log in to Your Account</a></li>
          <li><strong>Property:</strong> ${propertyName}</li>
          <li><strong>House Number:</strong> ${houseNumber}</li>
        </ul>
        <p style="font-size: 14px; margin-top: 16px;">For security, please set a new password after logging in.</p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: "Welcome to Your New Home!",
      html,
    });
    console.log(`Welcome email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending welcome email to ${to}:`, error);
    throw new Error("Failed to send welcome email");
  }
}

export async function sendPasswordResetEmail({
  to,
  name,
  resetLink,
  propertyName = "your property",
  houseNumber = "",
}: ResetEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const html = generateStyledTemplate({
      name,
      title: "Set / Reset Your Password",
      intro: "A secure link has been generated so you can set up or reset your password.",
      details: `
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
          Click the button below to set your password:
        </p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="${resetLink}" class="button" style="padding: 14px 32px; font-size: 16px;">
            Set / Reset Password
          </a>
        </p>
        <p style="font-size: 14px; color: #dc2626; margin-top: 16px;">
          This link will expire in 1 hour for your security.
        </p>
        <p style="font-size: 14px; margin-top: 24px;">
          Property: <strong>${propertyName}</strong>  
          ${houseNumber ? ` | Unit/House: <strong>${houseNumber}</strong>` : ""}
        </p>
        <p style="font-size: 14px; margin-top: 16px;">
          If you did not request this link, please contact your property manager immediately.
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: "Set / Reset Your Tenant Password",
      html,
    });
    console.log(`Password reset email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending password reset email to ${to}:`, error);
    throw new Error("Failed to send password reset email");
  }
}

export async function sendUpdateEmail({
  to,
  name,
  email,
  propertyName,
  houseNumber,
}: UpdateEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const detailItems = [
      `<li><strong>Email:</strong> ${email}</li>`,
      propertyName ? `<li><strong>Property:</strong> ${propertyName}</li>` : "",
      houseNumber ? `<li><strong>House Number:</strong> ${houseNumber}</li>` : "",
    ].filter(Boolean).join("");

    const html = generateStyledTemplate({
      name,
      title: "Tenant Account Updated",
      intro: "Your account details have been successfully updated.",
      details: detailItems ? `<ul>${detailItems}</ul>` : "<p>No additional details available.</p>",
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: "Your Account Details Have Been Updated",
      html,
    });
    console.log(`Update email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending update email to ${to}:`, error);
    throw new Error("Failed to send update email");
  }
}

export async function sendReminderEmail({
  to,
  name,
  propertyName,
  houseNumber,
  rentDue,
  utilityDue,
  depositDue,
  totalDue,
  dueDate,
  reminderType,
}: ReminderEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const title = reminderType === "fiveDaysBefore" ? "Payment Schedule Reminder" : "Payment Due Notice";
    const intro =
      reminderType === "fiveDaysBefore"
        ? `This is an official reminder that your payment for ${propertyName} is due on ${dueDate}.`
        : `This is an official notice that your payment for ${propertyName} is due today (${dueDate}).`;

    const detailItems = [
      `<li><strong>Property:</strong> ${propertyName}</li>`,
      `<li><strong>Unit/House:</strong> ${houseNumber}</li>`,
      rentDue > 0 ? `<li><strong>Rent Due:</strong> Ksh. ${rentDue.toFixed(2)}</li>` : "",
      utilityDue > 0 ? `<li><strong>Utilities Due:</strong> Ksh. ${utilityDue.toFixed(2)}</li>` : "",
      depositDue > 0 ? `<li><strong>Deposit Due:</strong> Ksh. ${depositDue.toFixed(2)}</li>` : "",
      `<li><strong>Total Due:</strong> Ksh. ${totalDue.toFixed(2)}</li>`,
      `<li><strong>Due Date:</strong> ${dueDate}</li>`,
      `<li><strong>Action:</strong> Please make your payment by the due date to keep your account in good standing.</li>`,
    ].filter(Boolean).join("");

    const html = generateStyledTemplate({
      name,
      title,
      intro,
      details: `
        <ul>${detailItems}</ul>
        <p style="text-align: center; margin-top: 28px;">
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/tenant-portal" class="button">
            Open Tenant Portal
          </a>
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: title,
      html,
    });
    console.log(`Reminder email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending reminder email to ${to}:`, error);
    throw new Error("Failed to send reminder email");
  }
}

export async function sendContactLeadEmail({
  to,
  name,
  email,
  phone,
  subject,
  message,
  meta,
}: ContactLeadEmailOptions): Promise<void> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error("SMTP authentication missing (SMTP_USER/SMTP_PASS)");
  }

  const safeMessage = escapeHtml(message).replace(/\r?\n/g, "<br/>");
  const safeName = escapeHtml(name);
  const safeSubject = subject ? escapeHtml(subject) : undefined;
  const safeEmail = email ? escapeHtml(email) : undefined;
  const safePhone = phone ? escapeHtml(phone) : undefined;

  const html = generateStyledTemplate({
    name,
    title: "New Contact Message",
    intro: `A new message was submitted via the contact form by <strong>${safeName}</strong>.`,
    details: `
      <ul>
        ${safeSubject ? `<li><strong>Subject:</strong> ${safeSubject}</li>` : ""}
        ${safeEmail ? `<li><strong>Email:</strong> ${safeEmail}</li>` : ""}
        ${safePhone ? `<li><strong>Phone:</strong> ${safePhone}</li>` : ""}
        ${meta?.id ? `<li><strong>Lead ID:</strong> ${escapeHtml(meta.id)}</li>` : ""}
        ${meta?.createdAt ? `<li><strong>Submitted:</strong> ${escapeHtml(meta.createdAt)}</li>` : ""}
        ${meta?.ip ? `<li><strong>IP:</strong> ${escapeHtml(meta.ip)}</li>` : ""}
        ${meta?.origin ? `<li><strong>Origin:</strong> ${escapeHtml(meta.origin)}</li>` : ""}
        ${meta?.referer ? `<li><strong>Referer:</strong> ${escapeHtml(meta.referer)}</li>` : ""}
      </ul>
      <div style="margin-top: 18px; padding-top: 18px; border-top: 1px solid #e2e8f0;">
        <p style="margin: 0 0 10px; font-weight: 600; color: #1e3a8a;">Message</p>
        <div style="font-size: 15px; line-height: 1.7; color: #0f172a;">${safeMessage}</div>
      </div>
    `,
  });

  await transporter.sendMail({
    from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
    to,
    subject: safeSubject ? `Contact: ${safeSubject}` : "New contact form submission",
    replyTo: email ? `${name} <${email}>` : undefined,
    html,
    headers: meta?.userAgent ? { "X-Contact-User-Agent": meta.userAgent } : undefined,
  });
}

export async function sendInvoiceEmail({
  to,
  ownerName,
  propertyName,
  amount,
  dueDate,
  reminderType,
  dashboardUrl,
  invoiceNumber,
  pdfBytes,
}: InvoiceEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const title =
      reminderType === "manual"
        ? "Invoice Copy"
        : reminderType === "fiveDaysBefore"
          ? "Invoice Reminder"
          : "Invoice Due Today";
    const intro =
      reminderType === "manual"
        ? `Attached is a copy of your invoice for ${propertyName}.`
        : reminderType === "fiveDaysBefore"
          ? `This is a reminder that your invoice for ${propertyName} is due on ${dueDate}.`
          : `Your invoice for ${propertyName} is due today (${dueDate}).`;

    const html = generateStyledTemplate({
      name: ownerName || "Property Owner",
      title,
      intro,
      details: `
        <ul>
          <li><strong>Property:</strong> ${propertyName}</li>
          <li><strong>Invoice No.:</strong> ${invoiceNumber}</li>
          <li><strong>Amount:</strong> Ksh. ${amount.toFixed(2)}</li>
          <li><strong>Due Date:</strong> ${dueDate}</li>
        </ul>
        <p style="text-align: center; margin-top: 28px;">
          <a href="${dashboardUrl}" class="button">Open Dashboard</a>
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: `${title} • ${propertyName}`,
      html,
      attachments: pdfBytes
        ? [
            {
              filename: `invoice-${invoiceNumber}.pdf`,
              content: Buffer.isBuffer(pdfBytes) ? pdfBytes : Buffer.from(pdfBytes),
              contentType: "application/pdf",
            },
          ]
        : [],
    });
    console.log(`Invoice email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending invoice email to ${to}:`, error);
    throw new Error("Failed to send invoice email");
  }
}

export async function sendConfirmationEmail({
  to,
  name,
  propertyName,
  amount,
  paymentType,
  transactionId,
  paymentDate,
  tenantName,
  mpesaCode,
}: ConfirmationEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const isOwnerEmail = !!tenantName;
    const title = "Payment Confirmation";
    const intro = isOwnerEmail
      ? `A payment of Ksh. ${amount.toFixed(2)} by ${tenantName} for ${propertyName} has been successfully processed.`
      : `Your payment of Ksh. ${amount.toFixed(2)} for ${propertyName} has been successfully processed.`;

    const detailItems = [
      `<li><strong>Property:</strong> ${propertyName}</li>`,
      isOwnerEmail ? `<li><strong>Tenant:</strong> ${tenantName}</li>` : "",
      `<li><strong>Amount:</strong> Ksh. ${amount.toFixed(2)}</li>`,
      `<li><strong>Payment Type:</strong> ${paymentType}</li>`,
      mpesaCode ? `<li><strong>M-Pesa Code / Ref:</strong> ${mpesaCode}</li>` : "",
      `<li><strong>Transaction ID:</strong> ${transactionId}</li>`,
      `<li><strong>Payment Date:</strong> ${paymentDate}</li>`,
    ].filter(Boolean).join("");

    const html = generateStyledTemplate({
      name,
      title,
      intro,
      details: `
        <ul>${detailItems}</ul>
        <p style="text-align: center; margin-top: 32px;">
          <a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/tenant-portal" class="button">
            View Payment History
          </a>
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: title,
      html,
    });
    console.log(`Confirmation email sent to ${to} (${isOwnerEmail ? "owner" : "tenant"})`);
  } catch (error) {
    console.error(`Error sending confirmation email to ${to}:`, error);
    throw new Error("Failed to send confirmation email");
  }
}

export async function sendOwnerPasswordResetEmail({
  to,
  name,
  resetLink,
}: OwnerResetEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const html = generateStyledTemplate({
      name,
      title: "Owner Portal Password Reset",
      intro: "A secure link has been generated to reset your owner portal password.",
      details: `
        <p style="font-size: 16px; line-height: 1.6; margin-bottom: 24px;">
          Click the button below to reset your password:
        </p>
        <p style="text-align: center; margin: 32px 0;">
          <a href="${resetLink}" class="button" style="padding: 14px 32px; font-size: 16px;">
            Reset Owner Password
          </a>
        </p>
        <p style="font-size: 14px; color: #dc2626; margin-top: 16px;">
          This link will expire in 1 hour for your security.
        </p>
        <p style="font-size: 14px; margin-top: 16px;">
          If you did not request this, please ignore this email or contact support immediately.
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: "Reset Your Owner Portal Password",
      html,
    });
    console.log(`Owner password reset email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending owner password reset email to ${to}:`, error);
    throw new Error("Failed to send owner password reset email");
  }
}

export async function sendOtpEmail({
  to,
  name,
  code,
}: OtpEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const html = generateStyledTemplate({
      name,
      title: "Your Login Verification Code",
      intro: "Use the code below to complete your sign-in.",
      details: `
        <p style="font-size: 20px; font-weight: 700; letter-spacing: 2px; text-align: center; margin: 16px 0;">
          ${code}
        </p>
        <p style="font-size: 14px; color: #dc2626; text-align: center; margin-top: 12px;">
          This code expires in 10 minutes.
        </p>
        <p style="font-size: 14px; margin-top: 16px; text-align: center;">
          If you did not request this, please contact support immediately.
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: "Your OTP Code",
      html,
    });
    console.log(`OTP email sent to ${to}`);
  } catch (error) {
    const err = error as { code?: string; responseCode?: number; response?: string; message?: string };
    console.error(`Error sending OTP email to ${to}:`, {
      code: err?.code,
      responseCode: err?.responseCode,
      response: err?.response,
      message: err?.message,
    });

    if (err?.code === "EAUTH" || err?.responseCode === 535) {
      throw new Error("SMTP authentication failed. Check SMTP_USER/SMTP_PASS (use an app password if required).");
    }

    throw new Error("Failed to send OTP email");
  }
}

export async function sendAirbnbGuestMessageEmail({
  to,
  guestName,
  listingName,
  message,
  subject,
}: AirbnbGuestMessageOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const html = generateStyledTemplate({
      name: guestName,
      title: subject || `Message from ${listingName}`,
      intro: `Hello ${guestName},`,
      details: `
        <p style="font-size: 15px; line-height: 1.7; margin-bottom: 16px;">
          ${message}
        </p>
        <p style="font-size: 13px; color: #475569;">
          Listing: <strong>${listingName}</strong>
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: subject || `Message from ${listingName}`,
      html,
    });
    console.log(`Airbnb guest email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending Airbnb guest email to ${to}:`, error);
    throw new Error("Failed to send Airbnb guest email");
  }
}

export async function sendAirbnbBookingConfirmationEmail({
  to,
  guestName,
  listingName,
  checkIn,
  checkOut,
  nights,
  total,
  supportEmail,
  bookingReference,
  bookingStatus = "confirmed",
  hostName,
  hostPhone,
  paymentMethod,
  mpesaCode,
}: AirbnbBookingEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const isConfirmed = bookingStatus === "confirmed";
    const title = isConfirmed ? "Booking Confirmed" : "Payment Verification Pending";
    const intro = isConfirmed
      ? `Your booking at ${listingName} is confirmed.`
      : `Your booking at ${listingName} has been received and is waiting for payment verification.`;

    const details = [
      `<li><strong>Booking Reference:</strong> ${bookingReference || "Pending"}</li>`,
      `<li><strong>Check-in:</strong> ${checkIn}</li>`,
      `<li><strong>Check-out:</strong> ${checkOut}</li>`,
      `<li><strong>Nights:</strong> ${nights}</li>`,
      `<li><strong>Total:</strong> Ksh ${total.toLocaleString("en-KE")}</li>`,
      hostName ? `<li><strong>Host:</strong> ${hostName}</li>` : "",
      hostPhone ? `<li><strong>Host Contact:</strong> ${hostPhone}</li>` : "",
      paymentMethod ? `<li><strong>Payment Method:</strong> ${paymentMethod}</li>` : "",
      mpesaCode ? `<li><strong>M-Pesa Reference:</strong> ${mpesaCode}</li>` : "",
    ]
      .filter(Boolean)
      .join("");

    const html = generateStyledTemplate({
      name: guestName,
      title,
      intro,
      details: `
        <ul>
          ${details}
        </ul>
        ${
          !isConfirmed
            ? "<p style=\"font-size: 14px; margin-top: 16px;\">We will confirm your reservation as soon as the payment is verified.</p>"
            : ""
        }
        <p style="font-size: 14px; margin-top: 16px;">
          Need help? Reach us at ${supportEmail || process.env.SMTP_USER}.
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: `${title}: ${listingName}`,
      html,
    });
    console.log(`Airbnb booking confirmation email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending Airbnb booking confirmation email to ${to}:`, error);
    throw new Error("Failed to send booking confirmation email");
  }
}

export async function sendAirbnbPaymentReceivedEmail({
  to,
  guestName,
  listingName,
  amount,
  paymentDate,
  reference,
  supportEmail,
}: AirbnbPaymentEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const detailItems = [
      `<li><strong>Listing:</strong> ${listingName}</li>`,
      `<li><strong>Amount:</strong> Ksh ${amount.toLocaleString("en-KE")}</li>`,
      `<li><strong>Payment date:</strong> ${paymentDate}</li>`,
      reference ? `<li><strong>Reference:</strong> ${reference}</li>` : "",
    ]
      .filter(Boolean)
      .join("");

    const html = generateStyledTemplate({
      name: guestName,
      title: "Payment Received",
      intro: `We have received your payment for ${listingName}.`,
      details: `
        <ul>${detailItems}</ul>
        <p style="font-size: 14px; margin-top: 16px;">
          Questions? Reach us at ${supportEmail || process.env.SMTP_USER}.
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: `Payment received: ${listingName}`,
      html,
    });
    console.log(`Airbnb payment receipt email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending Airbnb payment receipt email to ${to}:`, error);
    throw new Error("Failed to send payment receipt email");
  }
}

export async function sendAirbnbPaymentPortalInviteEmail({
  to,
  guestName,
  listingName,
  bookingId,
  amount,
  loginUrl,
  email,
  password,
  supportEmail,
}: AirbnbPaymentPortalInviteOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const html = generateStyledTemplate({
      name: guestName,
      title: "Your guest portal access",
      intro: `Your guest portal has been created for ${listingName}. Use the details below to log in.`,
      details: `
        <ul>
          <li><strong>Booking:</strong> ${bookingId}</li>
          <li><strong>Amount:</strong> KES ${Number(amount || 0).toLocaleString("en-KE")}</li>
          <li><strong>Login URL:</strong> <a href="${loginUrl}" class="button">Log in</a></li>
          <li><strong>Email:</strong> ${email}</li>
          <li><strong>Temporary Password:</strong> ${password}</li>
        </ul>
        <p style="font-size: 14px; margin-top: 16px;">
          Keep these details safe. If you need help, contact ${supportEmail || "the host"}.
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: `Guest portal access (${listingName})`,
      html,
    });
    console.log(`Airbnb payment portal invite email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending Airbnb payment portal invite email to ${to}:`, error);
    throw new Error("Failed to send Airbnb payment portal invite email");
  }
}

export async function sendAirbnbReminderEmail({
  to,
  guestName,
  listingName,
  date,
  supportEmail,
  type,
}: AirbnbReminderEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const title = type === "checkin" ? "Check-in Reminder" : "Check-out Reminder";
    const intro =
      type === "checkin"
        ? `Your check-in at ${listingName} is scheduled for ${date}.`
        : `Your check-out from ${listingName} is scheduled for ${date}.`;

    const html = generateStyledTemplate({
      name: guestName,
      title,
      intro,
      details: `
        <p style="font-size: 14px; margin-top: 12px;">
          If you need assistance, contact ${supportEmail || process.env.SMTP_USER}.
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: `${title}: ${listingName}`,
      html,
    });
    console.log(`Airbnb ${type} reminder email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending Airbnb ${type} reminder email to ${to}:`, error);
    throw new Error("Failed to send reminder email");
  }
}

export async function sendVacateRequestEmail({
  to,
  ownerName,
  tenantName,
  propertyName,
  houseNumber,
  moveOutDate,
  message,
  dashboardUrl,
}: VacateRequestEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const detailItems = [
      `<li><strong>Tenant:</strong> ${tenantName}</li>`,
      `<li><strong>Property:</strong> ${propertyName}</li>`,
      houseNumber ? `<li><strong>House/Unit:</strong> ${houseNumber}</li>` : "",
      moveOutDate ? `<li><strong>Preferred move-out:</strong> ${moveOutDate}</li>` : "",
      `<li><strong>Message:</strong> ${message}</li>`,
    ].filter(Boolean).join("");

    const html = generateStyledTemplate({
      name: ownerName || "Property Owner",
      title: "Tenant Vacate Request",
      intro: "A tenant has submitted a request to vacate. Please review and approve in your dashboard.",
      details: `
        <ul>${detailItems}</ul>
        <p style="text-align: center; margin-top: 32px;">
          <a href="${dashboardUrl}" class="button">Review Vacate Requests</a>
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: "Tenant Vacate Request Submitted",
      html,
    });
    console.log(`Vacate request email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending vacate request email to ${to}:`, error);
    throw new Error("Failed to send vacate request email");
  }
}

export async function sendTenantDeletionRequestEmail({
  to,
  ownerName,
  tenantName,
  propertyName,
  houseNumber,
  unitType,
  requestedBy,
  dashboardUrl,
}: TenantDeletionRequestEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const detailItems = [
      `<li><strong>Tenant:</strong> ${tenantName}</li>`,
      `<li><strong>Property:</strong> ${propertyName}</li>`,
      houseNumber ? `<li><strong>House/Unit:</strong> ${houseNumber}</li>` : "",
      unitType ? `<li><strong>Unit Type:</strong> ${unitType}</li>` : "",
      `<li><strong>Requested By:</strong> ${requestedBy}</li>`,
    ].filter(Boolean).join("");

    const html = generateStyledTemplate({
      name: ownerName || "Property Owner",
      title: "Tenant Deletion Request",
      intro: "A team member has requested to delete a tenant. Please review and approve before removal.",
      details: `
        <ul>${detailItems}</ul>
        <p style="text-align: center; margin-top: 32px;">
          <a href="${dashboardUrl}" class="button">Review Deletion Requests</a>
        </p>
      `,
    });

    await transporter.sendMail({
      from: `"Sorana Property Managers Ltd" <${process.env.SMTP_USER}>`,
      to,
      subject: "Tenant Deletion Request Submitted",
      html,
    });
    console.log(`Tenant deletion request email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending tenant deletion request email to ${to}:`, error);
    throw new Error("Failed to send tenant deletion request email");
  }
}

