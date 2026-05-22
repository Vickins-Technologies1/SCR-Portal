import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/session";
import { CSRF_COOKIE_NAME } from "@/lib/csrf";

const COOKIE_PATH = "/";

const COOKIE_NAMES_TO_CLEAR = [
  SESSION_COOKIE_NAME,
  "userId",
  "role",
  "permissions",
  "ownerId",
  "managementType",
  "tier",
  "adminName",
  CSRF_COOKIE_NAME,
  "impersonatingTenantId",
  "isImpersonating",
  "adminOriginalUserId",
  "adminOriginalRole",
  "adminImpersonating",
  "adminImpersonatingOwnerId",
  "adminImpersonatingOwnerName",
] as const;

export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ success: true });

  for (const name of COOKIE_NAMES_TO_CLEAR) {
    response.cookies.delete({ name, path: COOKIE_PATH });
  }

  return response;
}

