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

/**
 * Send SMS via BlessedTexts Bulk SMS API
 */
export async function sendWelcomeSms({
  phone,
  message,
  senderId = "BLESSEDTEXT",
}: SendSmsOptions): Promise<void> {
  // === VALIDATION ===
  if (!phone?.trim()) throw new Error("Phone number is required");
  if (!message?.trim()) throw new Error("Message is required");
  if (message.trim().length > 160) {
    throw new Error("SMS message exceeds 160 characters");
  }

  const apiKey = process.env.BLESSEDTEXTS_API_KEY;
  if (!apiKey) {
    throw new Error("BLESSEDTEXTS_API_KEY is missing in environment");
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
    sender_id: senderId,
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
      sender: senderId,
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
      sender: senderId,
      message_id: successItem.message_id,
      cost: successItem.message_cost,
    });

  } catch (error) {
    logger.error("sendWelcomeSms() Failed", {
      phone: recipient,
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error; // Re-throw for caller to handle
  }
}