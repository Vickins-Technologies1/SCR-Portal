import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

const SettingsSchema = z.object({
  brandName: z.string().trim().max(120).optional(),
  supportEmail: z.string().trim().email().optional(),
  supportPhone: z.string().trim().max(32).optional(),
  currency: z.string().trim().max(8).optional(),
  checkInTime: z.string().trim().max(20).optional(),
  checkOutTime: z.string().trim().max(20).optional(),
  minNights: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(1).max(365)).optional(),
  maxNights: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().int().min(1).max(365)).optional(),
  cleaningFee: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().nonnegative()).optional(),
  serviceFee: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().nonnegative()).optional(),
  taxRate: z.preprocess((v) => (v === undefined ? undefined : Number(v)), z.number().min(0).max(100)).optional(),
  cancellationPolicy: z.string().trim().max(240).optional(),
  houseRules: z.string().trim().max(1000).optional(),
  instantBook: z.boolean().optional(),
  sendBookingConfirmation: z.boolean().optional(),
  sendPaymentReceipt: z.boolean().optional(),
  sendCheckInReminder: z.boolean().optional(),
  sendCheckOutReminder: z.boolean().optional(),
});

const defaultSettings = {
  brandName: "Sorana Short-Stays",
  supportEmail: "bookings@soranapropertymanagers.com",
  supportPhone: "",
  currency: "KES",
  checkInTime: "3:00 PM",
  checkOutTime: "11:00 AM",
  minNights: 2,
  maxNights: 21,
  cleaningFee: 0,
  serviceFee: 0,
  taxRate: 0,
  cancellationPolicy: "Flexible (full refund 1 day prior to arrival)",
  houseRules: "",
  instantBook: true,
  sendBookingConfirmation: true,
  sendPaymentReceipt: true,
  sendCheckInReminder: true,
  sendCheckOutReminder: true,
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();
  const existing = await db.collection("airbnbSettings").findOne({ ownerId });
  const now = new Date().toISOString();

  if (!existing) {
    const payload = { ownerId, ...defaultSettings, createdAt: now, updatedAt: now };
    await db.collection("airbnbSettings").insertOne(payload);
    return NextResponse.json({ success: true, settings: payload });
  }

  const sanitized = { ...existing } as Record<string, unknown>;
  delete sanitized.icalToken;
  delete sanitized.icalExportEnabled;
  delete sanitized.icalImportUrl;

  return NextResponse.json({
    success: true,
    settings: { ...defaultSettings, ...sanitized },
  });
}

export async function PUT(request: NextRequest) {
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

  const parsed = SettingsSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid settings payload" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const now = new Date().toISOString();
  const existing = await db.collection("airbnbSettings").findOne({ ownerId });

  const update = {
    ...defaultSettings,
    ...existing,
    ...parsed.data,
    ownerId,
    updatedAt: now,
  };

  delete (update as Record<string, unknown>).icalToken;
  delete (update as Record<string, unknown>).icalExportEnabled;
  delete (update as Record<string, unknown>).icalImportUrl;

  await db.collection("airbnbSettings").updateOne(
    { ownerId },
    {
      $set: update,
      $unset: { icalToken: "", icalExportEnabled: "", icalImportUrl: "" },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true }
  );

  return NextResponse.json({ success: true, settings: update });
}
