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

interface ConfirmationEmailOptions {
  to: string;
  name: string;
  propertyName: string;
  amount: number;
  paymentType: string;
  transactionId: string;
  paymentDate: string;
  tenantName?: string; // Optional for owner emails
}

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
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
      intro: "Your tenant account has been successfully created. Below are your login details to access your account and manage your rental information.",
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
      from: `"Smart Choice Rental Management" <${process.env.SMTP_USER}>`,
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
      details: `<ul>${detailItems}</ul>`,
    });

    await transporter.sendMail({
      from: `"Smart Choice Rental Management" <${process.env.SMTP_USER}>`,
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

    const title =
      reminderType === "fiveDaysBefore"
        ? "Upcoming Payment Reminder"
        : "Payment Due Today";
    const intro =
      reminderType === "fiveDaysBefore"
        ? `This is a reminder that your payment for ${propertyName} is due in 5 days.`
        : `This is a reminder that your payment for ${propertyName} is due today.`;

    const detailItems = [
      `<li><strong>Property:</strong> ${propertyName}</li>`,
      `<li><strong>House Number:</strong> ${houseNumber}</li>`,
      rentDue > 0 ? `<li><strong>Rent Due:</strong> Ksh. ${rentDue.toFixed(2)}</li>` : "",
      utilityDue > 0 ? `<li><strong>Utilities Due:</strong> Ksh. ${utilityDue.toFixed(2)}</li>` : "",
      depositDue > 0 ? `<li><strong>Deposit Due:</strong> Ksh. ${depositDue.toFixed(2)}</li>` : "",
      `<li><strong>Total Due:</strong> Ksh. ${totalDue.toFixed(2)}</li>`,
      `<li><strong>Due Date:</strong> ${dueDate}</li>`,
      `<li><strong>Action:</strong> Please make your payment by the due date to avoid late fees.</li>`,
    ].filter(Boolean).join("");

    const html = generateStyledTemplate({
      name,
      title,
      intro,
      details: `
        <ul>${detailItems}</ul>
        <p><a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/tenant-portal" class="button">Go to Tenant Portal</a></p>
      `,
    });

    await transporter.sendMail({
      from: `"Smart Choice Rental Management" <${process.env.SMTP_USER}>`,
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

export async function sendConfirmationEmail({
  to,
  name,
  propertyName,
  amount,
  paymentType,
  transactionId,
  paymentDate,
  tenantName,
}: ConfirmationEmailOptions): Promise<void> {
  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP credentials are missing");
    }

    const title = "Payment Confirmation";
    const intro = tenantName
      ? `A payment by ${tenantName} for ${propertyName} has been successfully processed.`
      : `Your payment for ${propertyName} has been successfully processed.`;

    const detailItems = [
      `<li><strong>Property:</strong> ${propertyName}</li>`,
      tenantName ? `<li><strong>Tenant:</strong> ${tenantName}</li>` : "",
      `<li><strong>Amount:</strong> Ksh. ${amount.toFixed(2)}</li>`,
      `<li><strong>Payment Type:</strong> ${paymentType}</li>`,
      `<li><strong>Transaction ID:</strong> ${transactionId}</li>`,
      `<li><strong>Payment Date:</strong> ${paymentDate}</li>`,
    ].filter(Boolean).join("");

    const html = generateStyledTemplate({
      name,
      title,
      intro,
      details: `
        <ul>${detailItems}</ul>
        <p><a href="${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/tenant-portal" class="button">View Payment History</a></p>
      `,
    });

    await transporter.sendMail({
      from: `"Smart Choice Rental Management" <${process.env.SMTP_USER}>`,
      to,
      subject: "Payment Confirmation",
      html,
    });
    console.log(`Confirmation email sent to ${to}`);
  } catch (error) {
    console.error(`Error sending confirmation email to ${to}:`, error);
    throw new Error("Failed to send confirmation email");
  }
}