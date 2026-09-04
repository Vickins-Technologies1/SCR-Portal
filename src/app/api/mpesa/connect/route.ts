// src/app/api/mpesa/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { listLandlordMpesaConnections } from "@/lib/mpesa-routing";

type PaymentType = "paybill" | "till";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  // Only property owners can fetch their own M-Pesa connection status
  if (!userId || !role || !["propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectMongoose();
    const connections = await listLandlordMpesaConnections({ landlordId: userId });
    const doc = connections[0] || null;
    const safePaymentType: PaymentType = doc?.paymentType === "till" ? "till" : "paybill";
    const hasTill = !!doc?.tillNumber?.trim();
    const hasPaybill = !!doc?.paybillNumber?.trim();
    const hasPaybillAccount = !!doc?.paybillAccountNumber?.trim();
    const connected = connections.length > 0 && (safePaymentType === "till" ? hasTill : hasPaybill && hasPaybillAccount);

    return NextResponse.json({
      success: true,
      connected,
      paymentType: safePaymentType,
      paybillNumber: doc?.paybillNumber || "",
      paybillAccountNumber: doc?.paybillAccountNumber || "",
      tillNumber: doc?.tillNumber || "",
      isDefault: doc?.isDefault ?? true,
      routingKey: doc?.routingKey || "default",
      label: doc?.label || "",
      connections,
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
    return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
  }

  type Payload = {
    paymentType?: PaymentType;
    paybillNumber?: string;
    paybillAccountNumber?: string;
    tillNumber?: string;
    isDefault?: boolean;
    label?: string;
    routingKey?: string;
    propertyIds?: string[];
  };
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }
  const paymentType: PaymentType =
    payload.paymentType === "till" || payload.paymentType === "paybill" ? payload.paymentType : "paybill";

  try {
    await connectMongoose();
    if (paymentType === "till" && !payload.tillNumber) {
      return NextResponse.json(
        { success: false, message: "Please provide a till number." },
        { status: 400 }
      );
    } else if (paymentType === "paybill" && !payload.paybillNumber) {
      return NextResponse.json(
        { success: false, message: "Please provide a paybill number." },
        { status: 400 }
      );
    } else if (paymentType === "paybill" && !payload.paybillAccountNumber) {
      return NextResponse.json(
        { success: false, message: "Please provide a paybill account number." },
        { status: 400 }
      );
    }

    const routingKey = String(payload.routingKey || (Array.isArray(payload.propertyIds) && payload.propertyIds.length > 0 ? payload.propertyIds.map((id) => String(id).trim()).filter(Boolean).sort().join(":") : "default") || "default").trim() || "default";
    const normalizedPropertyIds = Array.isArray(payload.propertyIds)
      ? Array.from(new Set(payload.propertyIds.map((id) => String(id).trim()).filter(Boolean)))
      : [];

    await LandlordMpesa.findOneAndUpdate(
      { landlord: userId, routingKey },
      {
        landlord: userId,
        routingKey,
        label: String(payload.label || "").trim(),
        propertyIds: normalizedPropertyIds,
        enabled: true,
        paymentType,
        paybillNumber: paymentType === "paybill" ? payload.paybillNumber : "",
        paybillAccountNumber: paymentType === "paybill" ? payload.paybillAccountNumber : "",
        tillNumber: paymentType === "till" ? payload.tillNumber : "",
        isDefault: payload.isDefault ?? true,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, message: "Account details saved successfully" }, { status: 200 });
  } catch (error) {
    logger.error("POST /api/mpesa/connect error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return NextResponse.json({ success: false, message: "Failed to connect M-Pesa" }, { status: 500 });
  }
}
