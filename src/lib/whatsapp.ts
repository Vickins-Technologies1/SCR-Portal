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
}: SendWhatsAppOptions): Promise<boolean> {
  if (!phone || !message) {
    logger.error("Phone number or message missing", { phone, message });
    return false;
  }

  if (message.length > 4096) {
    logger.error("WhatsApp message exceeds 4096 character limit", {
      messageLength: message.length,
    });
    return false;
  }

  const apiKey = process.env.UMS_API_KEY;
  const appId = process.env.UMS_APP_ID;

  if (!apiKey || !appId || !deviceId) {
    logger.error("Missing WhatsApp API credentials", {
      apiKey: !!apiKey,
      appId: !!appId,
      deviceId: !!deviceId,
    });
    return false;
  }

  const normalizePhone = (phoneNum: string): string => {
    let normalized = phoneNum.replace(/\s/g, "").replace(/[^0-9+]/g, "");
    if (normalized.startsWith("0")) {
      normalized = "254" + normalized.slice(1);
    } else if (normalized.startsWith("+254")) {
      normalized = normalized.replace("+", "");
    } else if (!normalized.startsWith("254")) {
      normalized = "254" + normalized;
    }
    return normalized;
  };

  const phoneNumbers = Array.isArray(phone)
    ? phone.map(normalizePhone).join(",")
    : normalizePhone(phone);

  const isMultiple = Array.isArray(phone);
  const url = isMultiple
    ? `https://comms.umeskiasoftwares.com/api/v1/whatsapp/send/ums?api_key=${apiKey}&app_id=${appId}&device_id=${deviceId}&message=${encodeURIComponent(
        message
      )}&phone=${phoneNumbers}`
    : "https://comms.umeskiasoftwares.com/api/v1/whatsapp/send";

  const payload = isMultiple
    ? null
    : {
        api_key: apiKey,
        app_id: appId,
        device_id: deviceId,
        message,
        phone: phoneNumbers,
      };

  try {
    const response = await fetch(url, {
      method: isMultiple ? "GET" : "POST",
      headers: isMultiple
        ? { "x-api-key": apiKey }
        : {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
      body: isMultiple ? null : JSON.stringify(payload),
    });

    const contentType = response.headers.get("content-type");
    const data: WhatsAppResponse = contentType?.includes("application/json")
      ? await response.json()
      : {};

    if (!response.ok) {
      logger.warn("WhatsApp API returned error", {
        status: response.status,
        data,
      });
      return false;
    }

    // Safely handle both array and object response formats
    const dataStatus = Array.isArray(data.data)
      ? data.data[0]?.status
      : data.data?.status;

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
      return true;
    }

    if (data.error_code === 1007) {
      logger.error("Invalid WhatsApp Device ID", { deviceId });
    }

    logger.warn("WhatsApp API returned unknown state", { data });
    return false;
  } catch (error) {
    logger.error("Failed to send WhatsApp message", {
      phone: phoneNumbers,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }
}
