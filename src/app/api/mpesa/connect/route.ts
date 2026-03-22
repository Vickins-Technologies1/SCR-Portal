// src/app/api/mpesa/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { encryptPasskey } from "@/lib/mpesa";
import { validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";

const ConnectSchema = z.object({
  shortcode: z.string().trim().min(5).max(10),
  passkey: z.string().trim().min(8),
});

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  // Only property owners can fetch their own M-Pesa connection status
  if (!userId || !role || !["propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectMongoose();
    const doc = await LandlordMpesa.findOne({ landlord: userId })
      .select({ shortcode: 1, _id: 0 })
      .lean<{ shortcode: string }>()
      .exec();

    return NextResponse.json({
      success: true,
      connected: !!doc,
      shortcode: doc?.shortcode || null,
    });
  } catch (error) {
    logger.error("GET /api/mpesa/connect error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return NextResponse.json({ success: false, message: "Failed to fetch M-Pesa status" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");

  // Ensure only landlords can connect and CSRF is valid
  if (!userId || !role || !["propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
    return NextResponse.json({ success: false, message: "Invalid or missing CSRF token" }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = ConnectSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    await connectMongoose();
    // Encrypt passkey before persisting
    const encrypted = encryptPasskey(parsed.data.passkey);

    await LandlordMpesa.findOneAndUpdate(
      { landlord: userId },
      { shortcode: parsed.data.shortcode, passkey: encrypted },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, message: "M-Pesa connected successfully" }, { status: 200 });
  } catch (error) {
    logger.error("POST /api/mpesa/connect error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return NextResponse.json({ success: false, message: "Failed to connect M-Pesa" }, { status: 500 });
  }
}
