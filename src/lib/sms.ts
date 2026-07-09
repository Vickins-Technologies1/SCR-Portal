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

const MAX_SMS_LENGTH = 160;
const DEFAULT_SMS_ENDPOINT = "https://sms.blessedtexts.com/api/sms/v1/sendsms";
const SMS_REQUEST_TIMEOUT_MS = Number(process.env.BLESSEDTEXTS_TIMEOUT_MS || "8000");

const splitSmsMessage = (message: string, maxLength = MAX_SMS_LENGTH): string[] => {
  const normalized = message.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  if (normalized.length <= maxLength) return [normalized];

  const parts: string[] = [];
  let remaining = normalized;

  while (remaining.length > maxLength) {
    let cut = remaining.lastIndexOf("\n", maxLength);
    if (cut < Math.floor(maxLength * 0.6)) {
      cut = remaining.lastIndexOf(" ", maxLength);
    }
    if (cut <= 0) cut = maxLength;
    parts.push(remaining.slice(0, cut).trim());
    remaining = remaining.slice(cut).trim();
  }

  if (remaining.length) parts.push(remaining);
  return parts;
};

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
    throw new Error(`Invalid Kenyan phone format: ${phone}`);
  }

  const payload = {
    api_key: apiKey,
    sender_id: resolvedSenderId,
    message: message.trim(),
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

        logger.info("BlessedTexts SMS Request", {
          to: recipient,
          sender: resolvedSenderId,
          message: message.trim(),
          status: res.status,
          variant: variant.label,
        });

        if (!res.ok) {
          logger.error("BlessedTexts HTTP Error", {
            status: res.status,
            statusText: res.statusText,
            response: json ?? rawText.slice(0, 300),
            payload,
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
            phone: recipient,
            status: res.status,
            body: rawText.slice(0, 300),
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
            phone: recipient,
            error: failed.status_desc,
            code: failed.status_code,
            response: json,
            variant: variant.label,
          });
          throw new Error(`BlessedTexts: ${failed.status_desc} (${failed.status_code})`);
        }

        const successItem = responseArray[0];
        logger.info("SMS Sent Successfully", {
          phone: recipient,
          sender: resolvedSenderId,
          message_id: successItem.message_id,
          cost: successItem.message_cost,
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
            error: error.message,
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
      phone: phone,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
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

  const parts = splitSmsMessage(message.trim());
  if (parts.length === 0) {
    throw new Error("Message is required");
  }

  for (const part of parts) {
    await sendSingleSms({ phone, message: part, senderId });
  }
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
    ? `<#> Your Sorana verification code is ${code}\n${trimmedHash}`
    : `Your Sorana verification code is ${code}`;
  await sendWelcomeSms({ phone, message, senderId });
}
