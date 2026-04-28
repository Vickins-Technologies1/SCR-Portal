// src/app/api/revert-impersonation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

const normalizeManagementType = (value: unknown): "rentals" | "airbnb" => {
  if (typeof value !== "string") return "rentals";
  const normalized = value.trim().toLowerCase();
  return normalized === "airbnb" ? "airbnb" : "rentals";
};

export async function POST(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = sessionToken ? await verifySessionToken(sessionToken) : null;
  const managementType = normalizeManagementType(
    session?.managementType ?? request.cookies.get("managementType")?.value
  );

  const response = NextResponse.json({
    success: true,
    redirect: managementType === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard",
  });

  response.cookies.delete("impersonatingTenantId");
  response.cookies.delete("isImpersonating");

  return response;
}
