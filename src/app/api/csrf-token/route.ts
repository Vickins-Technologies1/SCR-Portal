import { NextRequest, NextResponse } from "next/server";
import { csrfProtection } from "../../../middleware";
import logger from "../../../lib/logger";

export async function GET(request: NextRequest) {
  try {
    return await new Promise<NextResponse>((resolve, reject) => {
      csrfProtection(request as any, {} as any, (err: any) => {
        if (err) {
          logger.error("CSRF protection failed", { error: err.message });
          return resolve(
            NextResponse.json(
              { success: false, message: "CSRF token validation failed" },
              { status: 403 }
            )
          );
        }

        try {
          const csrfToken = (request as any).csrfToken?.();
          logger.debug("Generated CSRF token");
          resolve(
            NextResponse.json({
              success: true,
              csrfToken,
            })
          );
        } catch (e) {
          logger.error("Failed to generate CSRF token", {
            message: e instanceof Error ? e.message : "Unknown error",
          });
          resolve(
            NextResponse.json(
              { success: false, message: "Failed to generate CSRF token" },
              { status: 500 }
            )
          );
        }
      });
    });
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
