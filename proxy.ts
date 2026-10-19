import type { NextRequest } from "next/server";
import { proxy as handleRequest } from "./src/proxy";

export function proxy(request: NextRequest) {
  return handleRequest(request);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/properties/:path*",
    "/property-listings/:path*",
    "/market-place/:path*",
    "/tenant-dashboard/:path*",
    "/airbnb-tenant-dashboard/:path*",
    "/property-owner-dashboard/:path*",
    "/airbnb-dashboard/:path*",
    "/tenants/:path*",
    "/upgrade/:path*",
  ],
};
