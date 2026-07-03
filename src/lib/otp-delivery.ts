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
}: DeliverOtpInput): Promise<DeliverOtpResult> {
  const smsTask = sendOtpSms({ phone, code }).then(() => "sms" as const);
  const emailTask = sendOtpEmail({ to: email, name, code }).then(() => "email" as const);

  try {
    const channel = await Promise.any([smsTask, emailTask]);

    return {
      channel,
      smsSent: channel === "sms",
      emailSent: channel === "email",
      message: channel === "sms" ? "OTP sent to your phone." : "OTP sent to your email.",
    };
  } catch (error) {
    const aggregate = error as AggregateError & { errors?: unknown[] };
    const firstError = aggregate.errors?.find((item): item is Error => item instanceof Error);
    throw new Error(firstError?.message || "OTP delivery failed. Please try again.");
  }
}
