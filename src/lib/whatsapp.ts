import logger from "./logger";

interface WhatsAppResponse {
  status?: string;
  message?: string;
  data?:
    | Array<{
        phone: string;
        status: string;
        message_id: string;
      }>
    | {
        msg_id: string;
        device_id: string;
        recipients: string;
        status: string;
      }
    | {
        status: string;
        error_code: number;
        message: string;
      };
  error?: string;
  error_code?: number;
}

interface SendWhatsAppOptions {
  phone: string | string[];
  message: string;
  deviceId?: string;
}

export async function sendWhatsAppMessage({
  phone,
  message,
  deviceId = process.env.UMS_DEFAULT_DEVICE_ID,
}: SendWhatsAppOptions): Promise<{ success: boolean; error?: { code: number; message: string } }> {
  // Validate inputs
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

  const apiKey = process.env.UMS_API_KEY;
  const appId = process.env.UMS_APP_ID;

  if (!apiKey || !appId || !deviceId) {
    logger.error("Missing WhatsApp API credentials", {
      apiKey: !!apiKey,
      appId: !!appId,
      deviceId: !!deviceId,
    });
    return { success: false, error: { code: 1003, message: "Missing WhatsApp API credentials" } };
  }

  // Normalize and validate phone numbers
  const normalizePhone = (phoneNum: string): string => {
    let normalized = phoneNum.replace(/\s/g, "").replace(/[^0-9+]/g, "");
    if (normalized.startsWith("0")) {
      normalized = "254" + normalized.slice(1);
    } else if (normalized.startsWith("+254")) {
      normalized = normalized.replace("+", "");
    } else if (!normalized.startsWith("254")) {
      normalized = "254" + normalized;
    }
    // Validate phone number format (e.g., 254 followed by 9 digits)
    if (!/^254[0-9]{9}$/.test(normalized)) {
      logger.error("Invalid phone number format after normalization", {
        original: phoneNum,
        normalized,
      });
      return normalized; // Proceed but log warning
    }
    logger.debug("Normalized phone number", { original: phoneNum, normalized });
    return normalized;
  };

  const phoneNumbers = Array.isArray(phone)
    ? phone.map(normalizePhone).join(",")
    : normalizePhone(phone);
  const isMultiple = Array.isArray(phone);

  logger.debug("Preparing WhatsApp API request", {
    phoneNumbers,
    isMultiple,
    messageLength: message.length,
    messageContent: message,
    deviceId,
  });

  // Warn about contact requirement
  logger.warn("Ensure recipient has sender's WhatsApp number saved in contacts for business message delivery", {
    phone: phoneNumbers,
    deviceId,
  });

  // Construct API request
  const url = isMultiple
    ? `https://comms.umeskiasoftwares.com/api/v1/whatsapp/send/ums?api_key=${apiKey}&app_id=${appId}&device_id=${deviceId}&message=${encodeURIComponent(
        message
      )}&phone=${phoneNumbers}`
    : "https://comms.umeskiasoftwares.com/api/v1/whatsapp/send";

  const headers: Record<string, string> = {
    "x-api-key": apiKey,
  };
  if (!isMultiple) {
    headers["Content-Type"] = "application/json";
  }

  const payload = isMultiple
    ? null
    : {
        api_key: apiKey,
        app_id: appId,
        device_id: deviceId,
        message,
        phone: phoneNumbers,
      };

  logger.debug("WhatsApp API request details", {
    url,
    method: isMultiple ? "GET" : "POST",
    headers,
    payload,
    encodedMessage: isMultiple ? encodeURIComponent(message) : undefined,
  });

  // Analyze message content for potential issues
  logger.debug("Message content analysis", {
    rawMessage: message,
    encodedMessage: encodeURIComponent(message),
    hasSpecialCharacters: /[^\w\s.,-]/.test(message),
  });

  try {
    const response = await fetch(url, {
      method: isMultiple ? "GET" : "POST",
      headers,
      body: payload ? JSON.stringify(payload) : null,
    });

    // Log full response details
    const contentType = response.headers.get("content-type");
    const responseHeaders = Object.fromEntries(response.headers.entries());
    logger.debug("WhatsApp API response received", {
      status: response.status,
      statusText: response.statusText,
      contentType,
      headers: responseHeaders,
    });

    // Parse response body
    let data: WhatsAppResponse = {};
    if (contentType?.includes("application/json")) {
      data = await response.json();
      logger.debug("WhatsApp API response body", { data });
    } else {
      const text = await response.text();
      logger.warn("Non-JSON response received from WhatsApp API", {
        status: response.status,
        contentType,
        body: text,
      });
      return {
        success: false,
        error: { code: response.status, message: `Non-JSON response: ${text}` },
      };
    }

    // Handle non-200 status codes
    if (!response.ok) {
      logger.warn("WhatsApp API returned error", {
        status: response.status,
        statusText: response.statusText,
        data,
      });
      return {
        success: false,
        error: data.data && "error_code" in data.data && data.data.error_code && "message" in data.data
          ? { code: data.data.error_code, message: data.data.message }
          : { code: response.status, message: "API request failed" },
      };
    }

    // Check response status
    const dataStatus = Array.isArray(data.data)
      ? data.data[0]?.status
      : data.data?.status;

    logger.debug("Checking WhatsApp response status", {
      apiStatus: data.status,
      dataStatus,
    });

    const success =
      ["success", "complete", "queued", "sent"].includes(
        data.status?.toLowerCase() || ""
      ) || dataStatus?.toLowerCase() === "sent";

    if (success) {
      logger.info("WhatsApp message sent successfully", {
        phone: phoneNumbers,
        messageId: Array.isArray(data.data)
          ? data.data[0]?.message_id
          : (data.data as { msg_id: string; device_id: string; recipients: string; status: string })?.msg_id || "N/A",
      });
      return { success: true };
    }

    // Handle specific error codes
    if (data.data && "error_code" in data.data && data.data.error_code) {
      const error = { code: data.data.error_code, message: data.data.message || "Unknown error" };
      logger.error("WhatsApp API returned specific error", {
        errorCode: data.data.error_code,
        errorMessage: data.data.message,
        phone: phoneNumbers,
        messageContent: message,
        deviceId,
      });
      if (data.data.error_code === 1007) {
        logger.error("Invalid WhatsApp Device ID", { deviceId });
      } else if (data.data.error_code === 1010) {
        logger.error(
          "Failed to send WhatsApp message, possible issues: recipient contact not saved, invalid number, or device configuration",
          {
            phone: phoneNumbers,
            deviceId,
            error: data.data.message || "Failed to send message",
            messageContent: message,
          }
        );
      } else {
        logger.error("WhatsApp API returned unknown error code", {
          errorCode: data.data.error_code,
          errorMessage: data.data.message,
          phone: phoneNumbers,
          messageContent: message,
        });
      }
      return { success: false, error };
    }

    logger.warn("WhatsApp API returned unexpected response format", { data });
    return { success: false, error: { code: 0, message: "Unexpected response format" } };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error("Failed to send WhatsApp message", {
      phone: phoneNumbers,
      messageContent: message,
      error: errorMessage,
      stack,
      deviceId,
    });
    return { success: false, error: { code: 1000, message: errorMessage } };
  }
}