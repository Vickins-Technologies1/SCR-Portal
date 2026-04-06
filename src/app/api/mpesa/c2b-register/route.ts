// src/app/api/mpesa/c2b-register/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAccessToken, getMpesaBaseUrl, getMpesaShortcode } from "@/lib/mpesa";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";

const RegisterSchema = z.object({
  responseType: z.enum(["Completed", "Canceled"]).default("Completed"),
});

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token");

  if (!userId || !role || role !== "propertyOwner") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
    return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const parsed = RegisterSchema.safeParse(payload || {});
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload", errors: parsed.error.flatten() }, { status: 400 });
  }

  try {
    // Use platform-level shortcode to register confirmation/validation URLs
    const shortcode = getMpesaShortcode();

    const base = process.env.MPESA_CALLBACK_BASE_URL || "";
    if (!base) {
      return NextResponse.json({ success: false, message: "Server configuration error" }, { status: 500 });
    }

    const token = await getAccessToken();
    const res = await fetch(`${getMpesaBaseUrl()}/mpesa/c2b/v1/registerurl`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ShortCode: shortcode,
        ResponseType: parsed.data.responseType,
        ConfirmationURL: `${base}/api/mpesa/c2b-confirmation`,
        ValidationURL: `${base}/api/mpesa/c2b-validation`,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      return NextResponse.json({ success: false, message: data?.errorMessage || "Failed to register URLs" }, { status: res.status });
    }

    return NextResponse.json({ success: true, message: "C2B URLs registered", data }, { status: 200 });
  } catch (error) {
    logger.error("POST /api/mpesa/c2b-register error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return NextResponse.json({ success: false, message: "Failed to register C2B URLs" }, { status: 500 });
  }
}
