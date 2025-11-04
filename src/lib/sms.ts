// src/lib/sms.ts
import logger from "./logger";

/**
 * TalkSasa SMS API Response
 */
interface TalkSasaResponse {
  status: "success" | "error";
  data?: any;
  message?: string;
}

/**
 * Options for sending SMS
 */
interface SendSmsOptions {
  phone: string;
  message: string;
  senderId?: string; // Must be approved in TalkSasa dashboard
}

/**
 * Send SMS via TalkSasa Bulk SMS API
 */
export async function sendWelcomeSms({
  phone,
  message,
  senderId = "TALKSASA",
}: SendSmsOptions): Promise<void> {
  // === VALIDATION ===
  if (!phone?.trim()) throw new Error("Phone number is required");
  if (!message?.trim()) throw new Error("Message is required");
  if (message.trim().length > 160) {
    throw new Error("SMS message exceeds 160 characters");
  }

  const apiToken = process.env.TALKSASA_API_TOKEN;
  if (!apiToken) {
    throw new Error("TALKSASA_API_TOKEN is missing in environment");
  }

  // === NORMALIZE PHONE: 0xxx → 254xxx ===
  let recipient = phone.replace(/\D/g, ""); // Remove non-digits
  if (recipient.startsWith("0") && recipient.length === 10) {
    recipient = "254" + recipient.slice(1);
  } else if (recipient.startsWith("254") && recipient.length === 12) {
    // Already good
  } else if (recipient.startsWith("7") || recipient.startsWith("1")) {
    recipient = "254" + recipient;
  } else {
    throw new Error(`Invalid Kenyan phone format: ${phone}`);
  }

  const payload = {
    recipient,
    sender_id: senderId,
    type: "plain",
    message: message.trim(),
  };

  try {
    const res = await fetch("https://www.bulksms.talksasa.com/api/v3/sms/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });

    let json: TalkSasaResponse;
    try {
      json = await res.json();
    } catch (e) {
      const text = await res.text();
      logger.error("TalkSasa returned non-JSON", {
        phone: recipient,
        status: res.status,
        body: text.slice(0, 200),
      });
      throw new Error("Invalid response from TalkSasa");
    }

    // === LOG REQUEST ===
    logger.info("TalkSasa SMS Request", {
      to: recipient,
      sender: senderId,
      message: message.trim(),
      status: res.status,
    });

    // === HANDLE HTTP ERRORS ===
    if (!res.ok) {
      logger.error("TalkSasa HTTP Error", {
        status: res.status,
        statusText: res.statusText,
        response: json,
        payload,
      });
      throw new Error(`TalkSasa API error: ${res.status} ${res.statusText}`);
    }

    // === HANDLE API ERRORS ===
    if (json.status === "error") {
      logger.error("TalkSasa SMS Failed", {
        phone: recipient,
        error: json.message,
        response: json,
      });
      throw new Error(`TalkSasa: ${json.message || "SMS failed"}`);
    }

    // === SUCCESS ===
    logger.info("SMS Sent Successfully", {
      phone: recipient,
      sender: senderId,
      response: json.data,
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