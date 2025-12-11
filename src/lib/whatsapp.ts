import logger from "./logger";

interface ApiWapResponse {
  message?: string;
  error?: string;
  [key: string]: any;
}

interface SendWhatsAppOptions {
  phone: string | string[];
  message: string;
}

export async function sendWhatsAppMessage({
  phone,
  message,
}: SendWhatsAppOptions): Promise<{ success: boolean; error?: { code: number; message: string } }> {
  const startTime = Date.now();

  // === Input Validation ===
  if (!phone || !message) {
    logger.error("Phone number or message missing", { phone, message });
    return { success: false, error: { code: 1001, message: "Phone number or message missing" } };
  }

  if (message.length > 4096) {
    logger.error("WhatsApp message exceeds 4096 character limit", {
      messageLength: message.length,
    });
    return { success: false, error: { code: 1002, message: "Message exceeds 4096 character limit" } };
  }

  const apiToken = process.env.APIWAP_TOKEN;

  if (!apiToken) {
    logger.error("Missing APIWAP_TOKEN environment variable");
    return { success: false, error: { code: 1003, message: "Missing WhatsApp API credentials" } };
  }

  // === Phone Normalization ===
  const normalizePhone = (phoneNum: string): string => {
    let normalized = phoneNum.replace(/\s/g, "").replace(/[^0-9+]/g, "");
    if (normalized.startsWith("0")) {
      normalized = "254" + normalized.slice(1);
    } else if (normalized.startsWith("+254")) {
      normalized = normalized.slice(1);
    } else if (!normalized.startsWith("254") && !normalized.startsWith("+")) {
      normalized = "254" + normalized;
    }
    normalized = "+" + normalized.replace(/^\+/, "");
    
    logger.debug("Phone normalization step", { original: phoneNum, afterCleanup: normalized });
    
    if (!/^\+\d{10,15}$/.test(normalized)) {
      logger.warn("Phone number may be invalid after normalization", { original: phoneNum, normalized });
    }
    return normalized;
  };

  const phoneNumbers = Array.isArray(phone)
    ? phone.map(normalizePhone)
    : [normalizePhone(phone)];

  logger.info("Starting WhatsApp message send via ApiWap", {
    phoneCount: phoneNumbers.length,
    phones: phoneNumbers,
    messageLength: message.length,
    messagePreview: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
  });

  // === Reminder about Instance ===
  logger.warn("ENSURE your ApiWap instance is CONNECTED and ONLINE in the dashboard before sending!");

  const url = "https://api.apiwap.com/api/v1/whatsapp/send-message";
  const headers = {
    "Authorization": `Bearer ${apiToken}`,
    "Content-Type": "application/json",
  };

  const results: Array<{ success: boolean; error?: any }> = [];

  for (const [index, singlePhone] of phoneNumbers.entries()) {
    const payload = {
      phoneNumber: singlePhone,
      message,
      type: "text",
    };

    logger.debug(`Sending message to phone ${index + 1}/${phoneNumbers.length}`, {
      phone: singlePhone,
      payload,
      headers: { ...headers, Authorization: "Bearer [REDACTED]" }, // Hide token in logs
      url,
    });

    let rawResponseText = "";
    let parsedData: any = null;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });

      const responseTime = Date.now() - startTime;
      rawResponseText = await response.text(); // Get raw text first

      logger.debug("Raw ApiWap response received", {
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        responseTimeMs: responseTime,
        rawBody: rawResponseText.substring(0, 1000), // Limit log size
      });

      // Try to parse JSON, fall back to raw text
      try {
        parsedData = rawResponseText ? JSON.parse(rawResponseText) : {};
      } catch (parseError) {
        logger.warn("Failed to parse ApiWap response as JSON, treating as plain text", {
          parseError: parseError instanceof Error ? parseError.message : String(parseError),
          rawBody: rawResponseText,
        });
        parsedData = { message: rawResponseText.trim() || "Empty response body" };
      }

      logger.debug("Parsed ApiWap response body", { parsedData });

      if (!response.ok) {
        const errorMessage =
          typeof parsedData === "string"
            ? parsedData
            : parsedData.message || parsedData.error || rawResponseText || "Unknown API error";

        logger.warn("ApiWap API request failed", {
          status: response.status,
          phone: singlePhone,
          errorMessage,
          fullResponse: parsedData,
        });

        results.push({
          success: false,
          error: { code: response.status, message: errorMessage },
        });
        continue;
      }

      // Success check based on official docs
      const successMessage = typeof parsedData === "string"
        ? parsedData
        : parsedData.message;

      if (successMessage?.includes("successfully") || successMessage === "Message sent successfully") {
        logger.info("WhatsApp message sent successfully via ApiWap", {
          phone: singlePhone,
          responseMessage: successMessage,
          responseTimeMs: responseTime,
        });
        results.push({ success: true });
      } else {
        logger.warn("ApiWap returned unexpected success response format", {
          phone: singlePhone,
          response: parsedData,
        });
        results.push({
          success: false,
          error: { code: 0, message: "Unexpected success response format" },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Network or unknown error";
      const stack = error instanceof Error ? error.stack : undefined;

      logger.error("Exception during ApiWap request", {
        phone: singlePhone,
        error: errorMessage,
        stack,
        rawResponseSoFar: rawResponseText,
      });

      results.push({ success: false, error: { code: 1000, message: errorMessage } });
    }
  }

  const allSuccess = results.every(r => r.success);
  const duration = Date.now() - startTime;

  if (allSuccess) {
    logger.info("All WhatsApp messages sent successfully", {
      phoneCount: phoneNumbers.length,
      totalTimeMs: duration,
    });
    return { success: true };
  } else {
    const failed = results.filter(r => !r.success);
    const firstError = failed[0]?.error || { code: 0, message: "Unknown failure" };

    logger.error("Failed to send WhatsApp message(s)", {
      successCount: results.filter(r => r.success).length,
      failedCount: failed.length,
      firstError,
      totalTimeMs: duration,
    });

    return { success: false, error: firstError };
  }
}