// src/app/api/csrf-token/route.ts
import { NextRequest, NextResponse } from "next/server";
import {
  CSRF_COOKIE_NAME,
  generateCsrfToken,
  getCsrfCookieOptions,
} from "../../../lib/csrf";
import logger from "../../../lib/logger";

export async function GET(request: NextRequest) {
  try {
    const existingToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
    if (existingToken) {
      return NextResponse.json({ success: true, csrfToken: existingToken });
    }

    const csrfToken = generateCsrfToken();

    const response = NextResponse.json({ success: true, csrfToken });

    response.cookies.set(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());

    logger.debug("Generated CSRF token");

    return response;
  } catch (error: unknown) {
    logger.error("Error generating CSRF token", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { success: false, message: "Failed to generate CSRF token" },
      { status: 500 }
    );
  }
}
