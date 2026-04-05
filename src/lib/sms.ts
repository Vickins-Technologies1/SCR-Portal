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

const sendSingleSms = async ({
  phone,
  message,
  senderId,
}: SendSmsOptions): Promise<void> => {
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
    const res = await fetch("https://sms.blessedtexts.com/api/sms/v1/sendsms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    let json: BlessedTextsResponse | BlessedTextsResponse[];
    let rawText = "";

    try {
      rawText = await res.text();
      json = JSON.parse(rawText);
    } catch (e) {
      logger.error("BlessedTexts returned non-JSON", {
        phone: recipient,
        status: res.status,
        body: rawText.slice(0, 300),
      });
      throw new Error("Invalid JSON response from BlessedTexts");
    }

    // === LOG REQUEST ===
    logger.info("BlessedTexts SMS Request", {
      to: recipient,
      sender: resolvedSenderId,
      message: message.trim(),
      status: res.status,
    });

    // === HANDLE HTTP ERRORS ===
    if (!res.ok) {
      logger.error("BlessedTexts HTTP Error", {
        status: res.status,
        statusText: res.statusText,
        response: json,
        payload,
      });
      throw new Error(`BlessedTexts API error: ${res.status} ${res.statusText}`);
    }

    // === HANDLE API ERRORS (status_code !== "1000") ===
    const responseArray = Array.isArray(json) ? json : [json];
    const failed = responseArray.find((item) => item.status_code !== "1000");

    if (failed) {
      logger.error("BlessedTexts SMS Failed", {
        phone: recipient,
        error: failed.status_desc,
        code: failed.status_code,
        response: json,
      });
      throw new Error(`BlessedTexts: ${failed.status_desc} (${failed.status_code})`);
    }

    // === SUCCESS ===
    const successItem = responseArray[0];
    logger.info("SMS Sent Successfully", {
      phone: recipient,
      sender: resolvedSenderId,
      message_id: successItem.message_id,
      cost: successItem.message_cost,
    });
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
  senderId,
}: {
  phone: string;
  code: string;
  senderId?: string;
}): Promise<void> {
  const message =
    `Your login verification code:\n` +
    `${code}\n` +
    `It expires in 10 minutes.`;
  await sendWelcomeSms({ phone, message, senderId });
}
