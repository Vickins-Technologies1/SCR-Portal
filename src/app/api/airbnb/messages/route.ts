import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { sendAirbnbGuestMessageEmail } from "@/lib/email";
import { sendWelcomeSms } from "@/lib/sms";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAirbnbTemplateById, renderAirbnbTemplate } from "@/lib/airbnb-messaging";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const conversations = await db
    .collection("airbnbConversations")
    .find({ ownerId })
    .sort({ lastMessageAt: -1 })
    .toArray();

  const bookings = await db
    .collection("airbnbBookings")
    .find({ ownerId })
    .project({ guestName: 1, listingName: 1, guestEmail: 1, guestPhone: 1, updatedAt: 1, createdAt: 1 })
    .toArray();

  const bookingMap = new Map<string, { guestEmail?: string; guestPhone?: string }>();
  for (const booking of bookings) {
    const key = `${booking.guestName || ""}::${booking.listingName || ""}`;
    if (!key) continue;
    if (!bookingMap.has(key)) {
      bookingMap.set(key, { guestEmail: booking.guestEmail, guestPhone: booking.guestPhone });
    }
  }

  return NextResponse.json({
    success: true,
    conversations: conversations.map((convo) => {
      const key = `${convo.guestName || ""}::${convo.listingName || ""}`;
      const bookingMatch = bookingMap.get(key);
      return {
        id: convo.externalId || convo._id?.toString?.() || "",
        guestName: convo.guestName,
        listingName: convo.listingName,
        lastMessage: convo.lastMessage,
        unread: convo.unread ?? 0,
        channel: convo.channel || "Airbnb",
        lastMessageAt: convo.lastMessageAt,
        guestEmail: convo.guestEmail || bookingMatch?.guestEmail,
        guestPhone: convo.guestPhone || bookingMatch?.guestPhone,
      };
    }),
  });
}

const MessageSchema = z.object({
  conversationId: z.string().optional(),
  guestName: z.string().trim().min(2).optional(),
  listingName: z.string().trim().min(2).optional(),
  message: z.string().trim().min(1).optional(),
  templateId: z.string().trim().optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().trim().optional(),
  deliveryChannels: z.array(z.enum(["email", "sms", "whatsapp"])).optional(),
});

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = MessageSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid message payload" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const now = new Date().toISOString();
  let conversation = null;

  if (parsed.data.conversationId) {
    const convoId = parsed.data.conversationId;
    const filter = ObjectId.isValid(convoId)
      ? { _id: new ObjectId(convoId), ownerId }
      : { externalId: convoId, ownerId };
    conversation = await db.collection("airbnbConversations").findOne(filter);
  }

  if (!conversation) {
    if (!parsed.data.guestName || !parsed.data.listingName) {
      return NextResponse.json(
        { success: false, message: "Guest name and listing name are required for new conversations." },
        { status: 400 }
      );
    }
    const externalId = `convo-${new ObjectId().toString()}`;
    const newConvo = {
      ownerId,
      externalId,
      guestName: parsed.data.guestName,
      listingName: parsed.data.listingName,
      lastMessage: parsed.data.message || "",
      unread: 0,
      channel: "In-app",
      guestEmail: parsed.data.guestEmail,
      guestPhone: parsed.data.guestPhone,
      lastMessageAt: now,
      createdAt: now,
      updatedAt: now,
    };
    await db.collection("airbnbConversations").insertOne(newConvo);
    conversation = newConvo;
  } else {
    const existingConversation = conversation as {
      _id?: ObjectId;
      guestEmail?: string;
      guestPhone?: string;
      lastMessage?: string;
    };
    const guestEmail = parsed.data.guestEmail || existingConversation.guestEmail;
    const guestPhone = parsed.data.guestPhone || existingConversation.guestPhone;
    await db.collection("airbnbConversations").updateOne(
      { _id: existingConversation._id },
      {
        $set: {
          lastMessage: parsed.data.message || existingConversation.lastMessage,
          lastMessageAt: now,
          unread: 0,
          channel: "In-app",
          guestEmail,
          guestPhone,
          updatedAt: now,
        },
      }
    );
    conversation = { ...existingConversation, guestEmail, guestPhone };
  }

  const convoRecord = conversation as { externalId?: string; _id?: ObjectId };
  const conversationId =
    convoRecord.externalId || convoRecord._id?.toString?.() || "";

  const convoDetails = conversation as {
    guestName?: string;
    listingName?: string;
    guestEmail?: string;
    guestPhone?: string;
  };

  const booking = await db.collection("airbnbBookings").findOne(
    { ownerId, guestName: convoDetails.guestName, listingName: convoDetails.listingName },
    { sort: { updatedAt: -1, createdAt: -1 } }
  );

  const template = getAirbnbTemplateById(parsed.data.templateId);
  const messageBody =
    parsed.data.message ||
    (template
      ? renderAirbnbTemplate(template.body, {
          name: convoDetails.guestName,
          listingName: convoDetails.listingName,
          checkInDate: booking?.checkIn ? new Date(booking.checkIn).toLocaleDateString("en-KE") : "",
          checkOutDate: booking?.checkOut ? new Date(booking.checkOut).toLocaleDateString("en-KE") : "",
          checkInTime: "2:00 PM",
          checkOutTime: "10:00 AM",
          accessCode: "XXXX",
          wifiName: "Sorana Wi-Fi",
          wifiPassword: "welcome123",
        })
      : "");

  if (!messageBody.trim()) {
    return NextResponse.json({ success: false, message: "Message body is required." }, { status: 400 });
  }

  const guestEmail = parsed.data.guestEmail || convoDetails.guestEmail || booking?.guestEmail;
  const guestPhone = parsed.data.guestPhone || convoDetails.guestPhone || booking?.guestPhone;

  const deliveryChannels = Array.from(
    new Set(parsed.data.deliveryChannels || [])
  );
  if (deliveryChannels.length === 0) {
    if (guestEmail) deliveryChannels.push("email");
    if (!guestEmail && guestPhone) deliveryChannels.push("sms");
  }

  const deliveries: Array<{
    channel: "email" | "sms" | "whatsapp";
    status: "sent" | "failed" | "skipped";
    recipient?: string;
    error?: string;
  }> = [];

  for (const channel of deliveryChannels) {
    if (channel === "email") {
      if (!guestEmail) {
        deliveries.push({ channel, status: "skipped" });
        continue;
      }
      try {
        await sendAirbnbGuestMessageEmail({
          to: guestEmail,
          guestName: convoDetails.guestName || "Guest",
          listingName: convoDetails.listingName || "Airbnb Listing",
          message: messageBody,
          subject: template?.title ? `${template.title} • ${convoDetails.listingName || "Airbnb"}` : undefined,
        });
        deliveries.push({ channel, status: "sent", recipient: guestEmail });
      } catch (error) {
        deliveries.push({
          channel,
          status: "failed",
          recipient: guestEmail,
          error: error instanceof Error ? error.message : "Email delivery failed",
        });
      }
      continue;
    }

    if (channel === "sms") {
      if (!guestPhone) {
        deliveries.push({ channel, status: "skipped" });
        continue;
      }
      try {
        await sendWelcomeSms({ phone: guestPhone, message: messageBody });
        deliveries.push({ channel, status: "sent", recipient: guestPhone });
      } catch (error) {
        deliveries.push({
          channel,
          status: "failed",
          recipient: guestPhone,
          error: error instanceof Error ? error.message : "SMS delivery failed",
        });
      }
      continue;
    }

    if (channel === "whatsapp") {
      if (!guestPhone) {
        deliveries.push({ channel, status: "skipped" });
        continue;
      }
      const response = await sendWhatsAppMessage({ phone: guestPhone, message: messageBody });
      if (response.success) {
        deliveries.push({ channel, status: "sent", recipient: guestPhone });
      } else {
        deliveries.push({
          channel,
          status: "failed",
          recipient: guestPhone,
          error: response.error?.message || "WhatsApp delivery failed",
        });
      }
    }
  }

  await db.collection("airbnbConversationMessages").insertOne({
    ownerId,
    conversationId,
    message: messageBody,
    sender: "host",
    templateId: template?.id,
    deliveryChannels,
    createdAt: now,
  });

  if (deliveries.length > 0) {
    await db.collection("airbnbMessageDeliveries").insertMany(
      deliveries.map((delivery) => ({
        ownerId,
        conversationId,
        channel: delivery.channel,
        recipient: delivery.recipient || "",
        status: delivery.status,
        provider:
          delivery.channel === "email"
            ? "smtp"
            : delivery.channel === "sms"
              ? "blessedtexts"
              : "apiwap",
        error: delivery.error || null,
        createdAt: now,
      }))
    );
  }

  return NextResponse.json({
    success: true,
    conversation: {
      id: conversationId || "",
      guestName: convoDetails.guestName || "Guest",
      listingName: convoDetails.listingName || "Airbnb Listing",
      lastMessage: messageBody,
      unread: 0,
      channel: "In-app",
      lastMessageAt: now,
      guestEmail: guestEmail || undefined,
      guestPhone: guestPhone || undefined,
    },
    deliveries,
  });
}
