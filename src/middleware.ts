// src/middleware.ts
import { NextResponse } from "next/server";

export function middleware(request: Request) {
  const cookies = request.headers.get("cookie");
  if (!cookies?.includes("userId") || !cookies?.includes("role=propertyOwner")) {
    console.log("Middleware: No valid cookies, redirecting to /");
    return NextResponse.redirect(new URL("/", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/properties/:path*", "/tenants/:path*", "/property-owner-dashboard/:path*"],
};