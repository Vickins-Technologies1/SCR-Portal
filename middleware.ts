import type { NextRequest } from "next/server";
import { proxy } from "./src/proxy";

export function middleware(request: NextRequest) {
  return proxy(request);
}

export const config = {
  matcher: [
    "/api/:path*",
    "/properties/:path*",
    "/property-listings/:path*",
    "/tenant-dashboard/:path*",
    "/airbnb-tenant-dashboard/:path*",
    "/property-owner-dashboard/:path*",
    "/airbnb-dashboard/:path*",
    "/tenants/:path*",
    "/upgrade/:path*",
  ],
};
