import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  const userId = request.cookies.get("userId")?.value;
  const path = request.nextUrl.pathname;

  // Admin-only routes
  const adminOnlyRoutes = [
    "/api/users",
    "/api/invoices/generate",
    "/api/admins",
    "/api/admin/properties",
    "/api/admin/property-owners",
  ];

  // Routes accessible to both admin and propertyOwner
  const sharedRoutes = [
    "/api/payments",
    "/api/invoices", // Moved from adminOnlyRoutes
  ];

  // Check for admin-only routes
  if (adminOnlyRoutes.some((route) => path.startsWith(route))) {
    if (role !== "admin") {
      console.log(`Middleware: Unauthorized access to ${path}, role: ${role}`);
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Check for shared routes (allow admin and propertyOwner)
  if (sharedRoutes.some((route) => path.startsWith(route))) {
    if (!role || !["admin", "propertyOwner"].includes(role)) {
      console.log(`Middleware: Unauthorized access to ${path}, role: ${role}`);
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Non-admin routes (properties, tenants, property-owner-dashboard, api/properties)
  const protectedRoutes = [
    "/properties",
    "/tenants",
    "/property-owner-dashboard",
    "/api/properties",
  ];

  if (protectedRoutes.some((route) => path.startsWith(route))) {
    if (!userId || !["propertyOwner", "tenant"].includes(role || "")) {
      console.log(`Middleware: No valid cookies for ${path}, userId: ${userId}, role: ${role}`);
      return NextResponse.redirect(new URL("/login", request.url));
    }
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/users",
    "/api/payments",
    "/api/invoices",
    "/api/invoices/generate",
    "/api/admins",
    "/api/admin/properties",
    "/api/admin/property-owners",
    "/properties/:path*",
    "/tenants/:path*",
    "/property-owner-dashboard/:path*",
    "/api/properties",
  ],
};