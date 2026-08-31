import { NextRequest, NextResponse } from "next/server";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { getAccessToken, getMpesaBaseUrl } from "@/lib/mpesa";

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  if (!userId || role !== "propertyOwner") return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

  const csrfToken = request.headers.get("x-csrf-token");
  if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");

  try {
    await connectMongoose();
    const connection = await LandlordMpesa.findOne({ landlord: userId }).select({ paymentType: 1, paybillNumber: 1, tillNumber: 1 }).lean<any>().exec();
    const shortcode = connection?.paymentType === "till" ? connection?.tillNumber : connection?.paybillNumber;
    if (!shortcode?.trim()) return NextResponse.json({ success: false, message: "Connect a Till or PayBill before registering C2B." }, { status: 400 });

    const baseUrl = process.env.MPESA_CALLBACK_BASE_URL?.trim().replace(/\/$/, "");
    if (!baseUrl || !baseUrl.startsWith("https://")) return NextResponse.json({ success: false, message: "HTTPS callback URL is required." }, { status: 500 });
    const token = await getAccessToken();
    const response = await fetch(`${getMpesaBaseUrl()}/mpesa/c2b/v2/registerurl`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        ShortCode: shortcode.trim(), ResponseType: "Completed",
        ConfirmationURL: `${baseUrl}/api/mpesa/c2b-confirmation`,
        ValidationURL: `${baseUrl}/api/mpesa/c2b-validation`,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || String(result?.ResponseCode || "0") !== "0") {
      return NextResponse.json({ success: false, message: result?.ResponseDescription || result?.errorMessage || "C2B registration failed" }, { status: 502 });
    }

    await LandlordMpesa.updateOne({ landlord: userId }, { $set: { status: "connected", lastVerifiedAt: new Date() } });
    return NextResponse.json({ success: true, message: "C2B callbacks registered successfully", shortcode: shortcode.trim() });
  } catch (error) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "C2B registration failed" }, { status: 502 });
  }
}
