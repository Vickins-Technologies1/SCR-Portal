import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { getAirbnbOwnerPaymentGateway } from "@/lib/airbnb-owner-integrations";

const PaymentGatewaySchema = z.object({
  gateway: z.enum(["tuma", "daraja"]),
});

export async function GET(request: NextRequest) {
  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;

  const { db } = await connectToDatabase();
  const gateway = await getAirbnbOwnerPaymentGateway(db, resolved.context!.ownerId);
  return NextResponse.json({ success: true, gateway });
}

export async function PUT(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;
  if (!ObjectId.isValid(ownerId)) {
    return NextResponse.json({ success: false, message: "Invalid owner ID" }, { status: 400 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }
  const parsed = PaymentGatewaySchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payment gateway" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const now = new Date().toISOString();
  await db.collection("airbnbOwnerIntegrations").updateOne(
    { ownerId: new ObjectId(ownerId) },
    {
      $set: { ownerId: new ObjectId(ownerId), paymentGateway: parsed.data.gateway, updatedAt: now },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return NextResponse.json({ success: true, gateway: parsed.data.gateway });
}
