import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import logger from "./lib/logger";

type Role = "admin" | "propertyOwner" | "tenant" | null;

interface RouteAccess {
  roles: Role[];
  isApi: boolean;
}

// In-memory rate limit store (consider Redis for production)
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100;

// Clean up old rate limit entries to prevent memory leaks
function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, record] of rateLimitStore) {
    if (now - record.lastReset > RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}

function rateLimiter(ip: string): { success: boolean; remaining: number } {
  cleanupRateLimitStore();
  const now = Date.now();
  const key = ip || "unknown";
  const record = rateLimitStore.get(key);

  if (!record || now - record.lastReset > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, lastReset: now });
    logger.debug("Rate limiter reset", { ip: key, path: "/middleware" });
    return { success: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  record.count += 1;
  if (record.count > RATE_LIMIT_MAX) {
    logger.warn("Rate limit exceeded", { ip: key, count: record.count });
    return { success: false, remaining: 0 };
  }

  rateLimitStore.set(key, record);
  logger.debug("Rate limiter check", { ip: key, remaining: RATE_LIMIT_MAX - record.count });
  return { success: true, remaining: RATE_LIMIT_MAX - record.count };
}

function generateCsrfToken(): string {
  return uuidv4();
}

async function validateCsrfToken(req: NextRequest): Promise<boolean> {
  const storedToken = req.cookies.get("csrf-token")?.value;
  const headerToken = req.headers.get("x-csrf-token");

  logger.debug("CSRF token validation", {
    path: req.nextUrl.pathname,
    storedToken,
    headerToken,
  });

  return !!storedToken && storedToken === headerToken;
}

function csrfMiddleware(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    if (!(await validateCsrfToken(req))) {
      logger.error("CSRF validation failed", {
        path: req.nextUrl.pathname,
        storedToken: req.cookies.get("csrf-token")?.value,
        headerToken: req.headers.get("x-csrf-token"),
      });
      return NextResponse.json(
        { success: false, message: "CSRF token validation failed" },
        { status: 403 }
      );
    }
    return handler(req);
  };
}

function rateLimitMiddleware(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rateLimitResult = rateLimiter(ip);

    if (!rateLimitResult.success) {
      logger.warn("Rate limit exceeded response", {
        ip,
        path: req.nextUrl.pathname,
      });
      return NextResponse.json(
        { success: false, message: "Too many requests, please try again later" },
        { status: 429 }
      );
    }

    return handler(req);
  };
}

const routeAccessMap: { [key: string]: RouteAccess } = {
  "/api/users": { roles: ["admin"], isApi: true },
  "/api/invoices/generate": { roles: ["admin"], isApi: true },
  "/api/admins": { roles: ["admin"], isApi: true },
  "/api/admin/properties": { roles: ["admin"], isApi: true },
  "/api/admin/property-owners": { roles: ["admin"], isApi: true },
  "/api/payments": { roles: ["admin", "propertyOwner", "tenant"], isApi: true },
  "/api/tenant/payments": { roles: ["tenant", "propertyOwner"], isApi: true },
  "/api/invoices": { roles: ["admin", "propertyOwner"], isApi: true },
  "/api/properties": { roles: ["propertyOwner", "tenant"], isApi: true },
  "/api/list-properties": { roles: ["propertyOwner"], isApi: true },
  "/api/tenants": { roles: ["propertyOwner", "tenant"], isApi: true },
  "/api/tenant/profile": { roles: ["tenant"], isApi: true },
  "/api/maintenance": { roles: ["tenant"], isApi: true },
  "/api/update-wallet": { roles: ["propertyOwner"], isApi: true },
  "/api/impersonate": { roles: ["propertyOwner"], isApi: true },
  "/api/impersonate/revert": { roles: ["tenant"], isApi: true },
  "/api/ownerstats": { roles: ["propertyOwner"], isApi: true },
  "/api/ownercharts": { roles: ["propertyOwner"], isApi: true },
  "/properties": { roles: ["propertyOwner", "tenant"], isApi: false },
  "/tenants": { roles: ["propertyOwner", "tenant"], isApi: false },
  "/property-owner-dashboard": { roles: ["propertyOwner"], isApi: false },
  "/tenant-dashboard": { roles: ["tenant"], isApi: false },
  "/property-listings": { roles: [], isApi: false },
};

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const method = request.method;

  // Skip middleware for static or HMR paths
  if (path.startsWith("/_next/static/") || path === "/_next/webpack-hmr") {
    logger.debug("Skipping middleware for static or HMR path", { path, method });
    return NextResponse.next();
  }

  // Skip middleware for public API routes
  if (path === "/api/public-properties" && method === "GET") {
    logger.debug("Skipping middleware for public GET /api/public-properties", { path, method });
    return NextResponse.next();
  }
  if (path.startsWith("/api/public-properties/") && method === "GET") {
    logger.debug("Skipping middleware for public GET /api/public-properties/[id]", { path, method });
    return NextResponse.next();
  }
  if (path === "/api/list-properties" && method === "GET" && request.nextUrl.searchParams.get("public") === "true") {
    logger.debug("Skipping middleware for public GET /api/list-properties", { path, method });
    return NextResponse.next();
  }

  // Redirect /properties/[id] to /property-listings/[id] for public access
  if (path.startsWith("/properties/") && method === "GET") {
    const id = path.split("/")[2];
    logger.debug("Redirecting /properties/[id] to /property-listings/[id]", { path, method, id });
    return NextResponse.redirect(new URL(`/property-listings/${id}`, request.url));
  }

  const startTime = Date.now();
  logger.debug("Middleware processing", { path, method });

  try {
    const cookieStore = request.cookies;
    const role = cookieStore.get("role")?.value as Role;
    const userId = cookieStore.get("userId")?.value;

    // Handle CSRF token generation
    if (path === "/api/csrf-token") {
      const csrfToken = generateCsrfToken();
      logger.debug("Generated CSRF token", { path, token: csrfToken });
      const response = NextResponse.json({ success: true, csrfToken });
      response.cookies.set("csrf-token", csrfToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 60 * 60, // 1 hour
      });
      return response;
    }

    // Find matching route
    const matchedRoute = Object.keys(routeAccessMap).find(
      (route) => path === route || path.startsWith(`${route}/`)
    );
    const routeConfig = matchedRoute ? routeAccessMap[matchedRoute] : null;

    logger.debug("Route match", {
      path,
      matchedRoute,
      routeConfig: JSON.stringify(routeConfig),
    });

    // Allow requests to unmatched routes
    if (!routeConfig) {
      logger.debug("No route config matched. Allowing request", { path, method });
      return NextResponse.next();
    }

    // Allow public routes
    if (routeConfig.roles.length === 0) {
      logger.debug("Public route access allowed", { path, method });
      return NextResponse.next();
    }

    // Check authentication
    if (!userId || !role) {
      logger.warn("Missing auth cookies", { path, method, userId, role });
      if (routeConfig.isApi) {
        return NextResponse.json(
          { success: false, message: "Unauthorized: Missing user ID or role" },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Check tenant-specific access for /api/tenants
    if (path.startsWith("/api/tenants/") && !path.startsWith("/api/tenant/") && role === "tenant") {
      const tenantId = path.split("/")[3];
      if (tenantId !== userId) {
        logger.error("Tenant unauthorized to access another tenant's data", {
          path,
          method,
          userId,
          role,
          tenantId,
        });
        return NextResponse.json(
          { success: false, message: "Unauthorized: Cannot access other tenant’s data" },
          { status: 403 }
        );
      }
    } else if (!routeConfig.roles.includes(role)) {
      logger.error("Unauthorized role access", {
        path,
        method,
        userId,
        role,
        allowedRoles: routeConfig.roles.join(", "),
      });
      if (routeConfig.isApi) {
        return NextResponse.json(
          { success: false, message: "Unauthorized: Insufficient role permissions" },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL("/", request.url));
    }

    // Apply CSRF and rate limiting for non-GET API routes
    if (routeConfig.isApi && method !== "GET") {
      logger.debug("Applying CSRF & rate limit", { path, method });
      return rateLimitMiddleware(csrfMiddleware(async () => NextResponse.next()))(request);
    }

    logger.info("Request allowed", {
      path,
      method,
      userId,
      role,
      duration: Date.now() - startTime,
    });
    return NextResponse.next();
  } catch (error: unknown) {
    logger.error("Middleware error", {
      path,
      method,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    const isApi = path.startsWith("/api/");
    if (isApi) {
      return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }
}

export const config = {
  matcher: [
    "/api/users/:path*",
    "/api/payments/:path*",
    "/api/tenant/payments",
    "/api/tenant/payments/:path*",
    "/api/tenant/profile",
    "/api/maintenance",
    "/api/invoices/:path*",
    "/api/invoices/generate/:path*",
    "/api/admins/:path*",
    "/api/admin/properties/:path*",
    "/api/admin/property-owners/:path*",
    "/api/properties/:path*",
    "/api/list-properties/:path*",
    "/api/tenants/:path*",
    "/api/update-wallet/:path*",
    "/api/csrf-token/:path*",
    "/api/impersonate/:path*",
    "/api/impersonate/revert/:path*",
    "/api/ownerstats/:path*",
    "/api/ownercharts/:path*",
    "/properties/:path*",
    "/tenants/:path*",
    "/property-owner-dashboard/:path*",
    "/tenant-dashboard/:path*",
    "/property-listings/:path*",
  ],
};