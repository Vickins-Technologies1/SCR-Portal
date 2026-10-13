// src/lib/sms.ts
import logger from "./logger";

/**
 * BlessedTexts SMS API Response
 */
interface BlessedTextsResponse {
  status_code: string;
  status_desc: string;
  message_id?: string;
  phone?: string;
  message_cost?: string;
  balance?: string;
}

/**
 * Options for sending SMS
 */
interface SendSmsOptions {
  phone: string;
  message: string;
  senderId?: string; // Must be approved in BlessedTexts dashboard
}

const DEFAULT_SMS_ENDPOINT = "https://sms.blessedtexts.com/api/sms/v1/sendsms";
const SMS_REQUEST_TIMEOUT_MS = Number(process.env.BLESSEDTEXTS_TIMEOUT_MS || "8000");

type SmsRequestVariant = {
  label: string;
  url: string;
  init: RequestInit;
};

const fetchWithTimeout = async (url: string, init: RequestInit, timeoutMs: number): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }
};

function errorCategory(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "timeout";
  if (error instanceof TypeError) return "network_error";
  return "provider_error";
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.length > 4 ? `***${digits.slice(-4)}` : "***";
}

const buildSmsVariants = (payload: Record<string, string>): SmsRequestVariant[] => {
  const endpoint = (process.env.BLESSEDTEXTS_SMS_ENDPOINT || DEFAULT_SMS_ENDPOINT).replace(/\/$/, "");
  const queryString = new URLSearchParams(payload).toString();

  return [
    {
      label: "json-post",
      url: endpoint,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      },
    },
    {
      label: "form-post",
      url: endpoint,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: queryString,
      },
    },
    {
      label: "query-get",
      url: `${endpoint}?${queryString}`,
      init: {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
      },
    },
  ];
};

const sendSingleSms = async ({ phone, message, senderId }: SendSmsOptions): Promise<void> => {
  const apiKey = process.env.BLESSEDTEXTS_API_KEY;
  if (!apiKey) {
    throw new Error("BLESSEDTEXTS_API_KEY is missing in environment");
  }
  const resolvedSenderId = senderId ?? process.env.BLESSEDTEXTS_SENDER_ID;
  if (!resolvedSenderId) {
    throw new Error("BLESSEDTEXTS_SENDER_ID is missing in environment");
  }

  // === NORMALIZE PHONE: 0xxx → 254xxx, 7xx → 2547xx ===
  let recipient = phone.replace(/\D/g, ""); // Remove non-digits

  if (recipient.startsWith("0") && recipient.length === 10) {
    recipient = "254" + recipient.slice(1);
  } else if (recipient.startsWith("254") && recipient.length === 12) {
    // Already in international format
  } else if ((recipient.startsWith("7") || recipient.startsWith("1")) && recipient.length === 9) {
    recipient = "254" + recipient;
  } else {
    throw new Error("Invalid Kenyan phone format");
  }

  const payload = {
    api_key: apiKey,
    sender_id: resolvedSenderId,
    message,
    phone: recipient,
  };

  try {
    const variants = buildSmsVariants(payload);
    let lastError: Error | null = null;

    for (const variant of variants) {
      try {
        const res = await fetchWithTimeout(variant.url, variant.init, SMS_REQUEST_TIMEOUT_MS);
        const rawText = await res.text();
        const retryableStatus = res.status === 405 || res.status === 415;

        let json: BlessedTextsResponse | BlessedTextsResponse[] | null = null;
        if (rawText.trim()) {
          try {
            json = JSON.parse(rawText);
          } catch {
            json = null;
          }
        }

        logger.info("SMS provider response", { provider: "BlessedTexts", operation: "send", recipient: maskPhone(recipient), status: res.status, variant: variant.label });

        if (!res.ok) {
          logger.error("BlessedTexts HTTP Error", {
            status: res.status,
            category: "http_error",
            variant: variant.label,
          });

          if (retryableStatus && variant !== variants[variants.length - 1]) {
            lastError = new Error(`BlessedTexts rejected ${variant.label} with HTTP ${res.status}`);
            continue;
          }

          throw new Error(`BlessedTexts API error: ${res.status} ${res.statusText}`);
        }

        if (!json) {
          logger.error("BlessedTexts returned non-JSON", {
            recipient: maskPhone(recipient),
            status: res.status,
            category: "invalid_response",
            variant: variant.label,
          });

          if (variant !== variants[variants.length - 1]) {
            lastError = new Error("Invalid JSON response from BlessedTexts");
            continue;
          }

          throw new Error("Invalid JSON response from BlessedTexts");
        }

        const responseArray = Array.isArray(json) ? json : [json];
        const failed = responseArray.find((item) => item.status_code !== "1000");

        if (failed) {
          logger.error("BlessedTexts SMS Failed", {
            recipient: maskPhone(recipient),
            errorCode: /^[A-Za-z0-9_-]{1,32}$/.test(failed.status_code) ? failed.status_code : "provider_error",
            variant: variant.label,
          });
          throw new Error("BlessedTexts delivery failed");
        }

        const successItem = responseArray[0];
        logger.info("SMS Sent Successfully", {
          recipient: maskPhone(recipient),
          messageId: typeof successItem.message_id === "string" ? successItem.message_id : undefined,
          variant: variant.label,
        });
        return;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const retryableTransportError =
          error.name === "AbortError" ||
          error.message.toLowerCase().includes("fetch") ||
          error.message.toLowerCase().includes("network") ||
          error.message.toLowerCase().includes("timeout");

        if (retryableTransportError && variant !== variants[variants.length - 1]) {
          lastError = error;
          logger.warn("BlessedTexts SMS attempt failed, trying fallback", {
            variant: variant.label,
            category: errorCategory(error),
          });
          continue;
        }

        throw error;
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error("Unable to send SMS");
  } catch (error) {
    logger.error("sendWelcomeSms() Failed", {
      recipient: maskPhone(phone),
      category: errorCategory(error),
    });
    throw error; // Re-throw for caller to handle
  }
};

/**
 * Send SMS via BlessedTexts Bulk SMS API
 */
export async function sendWelcomeSms({
  phone,
  message,
  senderId,
}: SendSmsOptions): Promise<void> {
  // === VALIDATION ===
  if (!phone?.trim()) throw new Error("Phone number is required");
  if (!message?.trim()) throw new Error("Message is required");

  // BlessedTexts now accepts the complete message in one request. Do not
  // apply the retired application-side segmentation rule here.
  await sendSingleSms({ phone, message, senderId });
}

export async function sendOtpSms({
  phone,
  code,
  appHash,
  senderId,
}: {
  phone: string;
  code: string;
  appHash?: string;
  senderId?: string;
}): Promise<void> {
  const trimmedHash = appHash?.trim();
  const message = trimmedHash
    ? `<#> Your My Accurate Rent verification code is ${code}\n${trimmedHash}`
    : `Your My Accurate Rent verification code is ${code}`;
  await sendWelcomeSms({ phone, message, senderId });
}
