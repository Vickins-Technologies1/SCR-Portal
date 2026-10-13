// src/lib/otp-delivery.ts
import { sendOtpEmail } from "./email";
import { sendOtpSms } from "./sms";

interface DeliverOtpInput {
  email: string;
  phone: string;
  name: string;
  code: string;
  appHash?: string;
}

interface DeliverOtpResult {
  channel: "sms" | "email";
  smsSent: boolean;
  emailSent: boolean;
  message: string;
  emailError?: string;
}

export async function deliverOtp({
  email,
  phone,
  name,
  code,
  appHash,
}: DeliverOtpInput): Promise<DeliverOtpResult> {
  const [smsResult, emailResult] = await Promise.allSettled([
    sendOtpSms({ phone, code, appHash }),
    sendOtpEmail({ to: email, name, code }),
  ]);

  if (smsResult.status === "fulfilled") {
    return {
      channel: "sms",
      smsSent: true,
      emailSent: emailResult.status === "fulfilled",
      message: "OTP sent to your phone.",
    };
  }

  if (emailResult.status === "fulfilled") {
    return {
      channel: "email",
      smsSent: false,
      emailSent: true,
      message: "OTP sent to your email.",
    };
  }

  // Provider errors can contain request/recipient details. Never surface them
  // through the OTP API response or callers' error telemetry.
  throw new Error("OTP delivery failed. Please try again.");
}
