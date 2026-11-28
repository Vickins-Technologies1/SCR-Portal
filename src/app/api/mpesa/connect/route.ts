// src/app/api/mpesa/connect/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { listLandlordMpesaConnections } from "@/lib/mpesa-routing";

type PaymentType = "paybill" | "till" | "bank";

function normalizePaymentType(value?: string): PaymentType {
  if (value === "till" || value === "bank" || value === "paybill") return value;
  return "paybill";
}

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || !["propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    await connectMongoose();
    const connections = await listLandlordMpesaConnections({ landlordId: userId });
    const doc = connections[0] || null;
    const safePaymentType = normalizePaymentType(doc?.paymentType);
    const hasTill = !!doc?.tillNumber?.trim();
    const hasPaybill = !!doc?.paybillNumber?.trim();
    const hasBank = !!doc?.bank?.trim() && !!doc?.bankAccount?.trim();
    const connected =
      connections.length > 0 &&
      (safePaymentType === "till" ? hasTill : safePaymentType === "bank" ? hasBank : hasPaybill);

    return NextResponse.json({
      success: true,
      connected,
      paymentType: safePaymentType,
      paybillNumber: doc?.paybillNumber || "",
      bankPaybillNumber: doc?.bank || "",
      bankAccountNumber: doc?.bankAccount || "",
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

  if (!userId || !role || !["propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
    return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
  }

  type Payload = {
    paymentType?: PaymentType;
    paybillNumber?: string;
    bankPaybillNumber?: string;
    bankAccountNumber?: string;
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
  const paymentType = normalizePaymentType(payload.paymentType);

  try {
    await connectMongoose();
    if (paymentType === "till" && !payload.tillNumber?.trim()) {
      return NextResponse.json({ success: false, message: "Please provide a till number." }, { status: 400 });
    }
    if (paymentType === "paybill" && !payload.paybillNumber?.trim()) {
      return NextResponse.json({ success: false, message: "Please provide a paybill number." }, { status: 400 });
    }
    if (paymentType === "bank") {
      if (!payload.bankPaybillNumber?.trim()) {
        return NextResponse.json({ success: false, message: "Please provide a bank paybill number." }, { status: 400 });
      }
      if (!payload.bankAccountNumber?.trim()) {
        return NextResponse.json({ success: false, message: "Please provide a bank account number." }, { status: 400 });
      }
    }

    const routingKey =
      String(
        payload.routingKey ||
          (Array.isArray(payload.propertyIds) && payload.propertyIds.length > 0
            ? payload.propertyIds
                .map((id) => String(id).trim())
                .filter(Boolean)
                .sort()
                .join(":")
            : "default") ||
          "default"
      ).trim() || "default";
    const normalizedPropertyIds = Array.isArray(payload.propertyIds)
      ? Array.from(new Set(payload.propertyIds.map((id) => String(id).trim()).filter(Boolean)))
      : [];

    await LandlordMpesa.findOneAndUpdate(
      { landlord: userId, routingKey },
      {
        $set: {
          landlord: userId,
          routingKey,
          label: String(payload.label || "").trim(),
          propertyIds: normalizedPropertyIds,
          enabled: true,
          paymentType,
          paybillNumber: paymentType === "paybill" ? payload.paybillNumber : "",
          paybillAccountNumber: "",
          tillNumber: paymentType === "till" ? payload.tillNumber : "",
          bankBranchRef: paymentType === "bank" ? payload.bankPaybillNumber : "",
          accountNumber: paymentType === "bank" ? payload.bankAccountNumber : "",
          isDefault: payload.isDefault ?? true,
        },
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
