import { NextResponse } from "next/server";
import { generateCsrfToken } from "../../../lib/csrf";
import logger from "../../../lib/logger";

export async function GET() {
  try {
    const csrfToken = generateCsrfToken();

    const response = NextResponse.json({ success: true, csrfToken });

    response.cookies.set('csrf-token', csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60,
    });

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