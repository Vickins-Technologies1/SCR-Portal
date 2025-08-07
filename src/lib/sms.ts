// src/lib/sms.ts
import logger from "./logger";

interface SmsResponse {
  status: string;
  message: string;
  data?: Array<{
    phone: string;
    status: string;
    message_id: string;
    sms_cost: number;
  }>;
  error_code?: number;
}

interface SendSmsOptions {
  phone: string;
  message: string;
  senderId?: string;
}

export async function sendWelcomeSms({
  phone,
  message,
  senderId = "UMS_SMS",
}: SendSmsOptions): Promise<void> {
  if (!phone || !message) {
    throw new Error("Phone number and message are required");
  }

  if (message.length > 160) {
    throw new Error("SMS message exceeds 160 character limit");
  }

  const apiKey = process.env.UMS_API_KEY;
  const appId = process.env.UMS_APP_ID;

  if (!apiKey || !appId) {
    throw new Error("UMS API key or App ID is missing");
  }

  // Normalize phone number to 254 format (e.g., 0794501005 -> 254794501005)
  let normalizedPhone = phone.replace(/\s/g, "");
  if (normalizedPhone.startsWith("0")) {
    normalizedPhone = "254" + normalizedPhone.slice(1);
  } else if (!normalizedPhone.startsWith("254")) {
    normalizedPhone = "254" + normalizedPhone;
  }

  const payload = {
    api_key: apiKey,
    app_id: appId,
    sender_id: senderId,
    message,
    phone: normalizedPhone,
  };

  try {
    const response = await fetch("https://comms.umeskiasoftwares.com/api/v1/sms/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey, // Include apiKey in headers as a precaution
      },
      body: JSON.stringify(payload),
    });

    // Check for non-200 status codes
    if (!response.ok) {
      const contentType = response.headers.get("content-type");
      const text = await response.text();
      logger.error("SMS API request failed", {
        phone: normalizedPhone,
        status: response.status,
        statusText: response.statusText,
        contentType: contentType || "unknown",
        response: text.substring(0, 200),
        payload,
      });

      // Map common error codes from documentation
      let errorMessage = `SMS API request failed with status ${response.status}: ${response.statusText}`;
      if (response.status === 401) {
        errorMessage = "Invalid API key or App ID (Error code: 1002)";
      } else if (response.status === 400) {
        errorMessage = "Invalid request parameters (possible Error code: 1001 or 1005)";
      }
      throw new Error(errorMessage);
    }

    // Check if response is JSON
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("application/json")) {
      const text = await response.text();
      logger.error("SMS API returned non-JSON response", {
        phone: normalizedPhone,
        status: response.status,
        contentType: contentType || "unknown",
        response: text.substring(0, 200),
        payload,
      });
      throw new Error(`SMS API returned non-JSON response (status: ${response.status})`);
    }

    const data: SmsResponse = await response.json();

    if (data.status !== "complete") {
      logger.error("SMS sending failed", {
        phone: normalizedPhone,
        message: data.message,
        errorCode: data.error_code || "N/A",
      });
      throw new Error(`SMS sending failed: ${data.message || "Unknown error"} (Error code: ${data.error_code || "N/A"})`);
    }

    logger.info("SMS sent successfully", {
      phone: normalizedPhone,
      messageId: data.data?.[0]?.message_id || "N/A",
    });
  } catch (error) {
    logger.error("Failed to send SMS", {
      phone: normalizedPhone,
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error("Failed to send SMS");
  }
}