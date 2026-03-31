// src/lib/otp-delivery.ts
import { sendOtpEmail } from "./email";
import { sendOtpSms } from "./sms";

interface DeliverOtpInput {
  email: string;
  phone: string;
  name: string;
  code: string;
}

interface DeliverOtpResult {
  smsSent: boolean;
  emailSent: boolean;
  emailError?: string;
}

export async function deliverOtp({
  email,
  phone,
  name,
  code,
}: DeliverOtpInput): Promise<DeliverOtpResult> {
  const [emailResult, smsResult] = await Promise.allSettled([
    sendOtpEmail({ to: email, name, code }),
    sendOtpSms({ phone, code }),
  ]);

  const emailSent = emailResult.status === "fulfilled";
  const smsSent = smsResult.status === "fulfilled";

  if (!smsSent) {
    const smsErr = smsResult.status === "rejected" ? smsResult.reason : null;
    const message =
      smsErr instanceof Error ? smsErr.message : "SMS delivery failed. Please try again.";
    throw new Error(message);
  }

  const emailError =
    emailResult.status === "rejected"
      ? emailResult.reason instanceof Error
        ? emailResult.reason.message
        : "Email delivery failed."
      : undefined;

  return { smsSent, emailSent, emailError };
}
