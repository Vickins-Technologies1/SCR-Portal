// src/app/api/kopokopo/incoming-payments/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";

function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  const secret = process.env.KOPOKOPO_CLIENT_SECRET || "";
  const signature = request.headers.get("x-kopokopo-signature");

  const bodyText = await request.text();
  if (secret) {
    if (!signature) {
      logger.error("Missing KopoKopo signature");
      return NextResponse.json({ success: false, message: "Missing signature" }, { status: 401 });
    }
    if (!verifySignature(bodyText, signature, secret)) {
      logger.error("Invalid KopoKopo signature", { signature });
      return NextResponse.json({ success: false, message: "Invalid signature" }, { status: 401 });
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const data = payload?.data;
  const id = data?.id ? String(data.id) : "";
  const attributes = data?.attributes || {};
  const eventResource = attributes?.event?.resource || {};

  const status = String(attributes?.status || "").toLowerCase();
  const resourceStatus = String(eventResource?.status || "").toLowerCase();
  const eventErrors = attributes?.event?.errors;
  const errorsLower = (Array.isArray(eventErrors) ? eventErrors.join("; ") : eventErrors || "")
    .toString()
    .toLowerCase();
  const reference = eventResource?.reference ? String(eventResource.reference) : "";
  const originationTime = eventResource?.origination_time ? String(eventResource.origination_time) : "";

  if (!id) {
    return NextResponse.json({ success: false, message: "Missing incoming payment id" }, { status: 400 });
  }

  const isCompleted = status === "success" && resourceStatus === "received" && !!reference;
  const isCancelled =
    status === "failed" &&
    (errorsLower.includes("cancel") || errorsLower.includes("canceled") || errorsLower.includes("cancelled"));
  const isFailed =
    status === "failed" ||
    resourceStatus === "failed" ||
    errorsLower.includes("timeout") ||
    errorsLower.includes("expired");
  const normalizedStatus = isCompleted ? "completed" : isCancelled ? "cancelled" : isFailed ? "failed" : "pending";

  try {
    const { db } = await connectToDatabase();
    const update: Record<string, any> = { status: normalizedStatus };
    if (isCompleted && reference) update.mpesaCode = reference;
    if (originationTime) update.paymentDate = originationTime;

    const result = await db.collection("payments").findOneAndUpdate(
      {
        $or: [
          { transactionId: id },
          { checkoutRequestId: id },
          { merchantRequestId: id },
          ...(reference ? [{ reference }] : []),
        ],
      },
      { $set: update },
      { returnDocument: "after" }
    );

    if (!result?.value) {
      logger.error("KopoKopo callback payment not found", { id, reference });
      return NextResponse.json({ success: false, message: "Payment not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("KopoKopo callback error", {
      message: error instanceof Error ? error.message : String(error),
      id,
      reference,
    });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
