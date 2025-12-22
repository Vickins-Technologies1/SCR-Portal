// src/app/api/revert-impersonation/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const response = NextResponse.json({
    success: true,
    redirect: "/property-owner-dashboard",
  });

  response.cookies.delete("impersonatingTenantId");
  response.cookies.delete("isImpersonating");

  return response;
}