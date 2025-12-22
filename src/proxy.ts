// src/proxy.ts
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import logger from "./lib/logger";

type Role = "admin" | "propertyOwner" | "tenant" | null;

interface RouteAccess {
  roles: Role[];
  isApi: boolean;
}

// Rate limiting
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100;

function cleanupRateLimitStore() {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now - record.lastReset > RATE_LIMIT_WINDOW_MS) {
      rateLimitStore.delete(key);
    }
  }
}

function rateLimiter(ip: string): { success: boolean; remaining: number } {
  cleanupRateLimitStore();
  const now = Date.now();
  const key = ip || "unknown";
  let record = rateLimitStore.get(key);

  if (!record || now - record.lastReset > RATE_LIMIT_WINDOW_MS) {
    record = { count: 1, lastReset: now };
    rateLimitStore.set(key, record);
    return { success: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  record.count += 1;
  if (record.count > RATE_LIMIT_MAX) {
    return { success: false, remaining: 0 };
  }

  rateLimitStore.set(key, record);
  return { success: true, remaining: RATE_LIMIT_MAX - record.count };
}

function generateCsrfToken(): string {
  return uuidv4();
}

async function validateCsrfToken(req: NextRequest): Promise<boolean> {
  const storedToken = req.cookies.get("csrf-token")?.value;
  const headerToken = req.headers.get("x-csrf-token");
  return !!storedToken && storedToken === headerToken;
}

function csrfMiddleware(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    if (!(await validateCsrfToken(req))) {
      logger.error("CSRF validation failed", {
        path: req.nextUrl.pathname,
        method: req.method,
        ip: req.headers.get("x-forwarded-for") || "unknown",
      });
      return NextResponse.json(
        { success: false, message: "Invalid CSRF token" },
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

    const { success, remaining } = rateLimiter(ip);

    if (!success) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please try again later." },
        { status: 429 }
      );
    }

    const response = await handler(req);
    response.headers.set("X-RateLimit-Remaining", remaining.toString());
    response.headers.set("X-RateLimit-Limit", RATE_LIMIT_MAX.toString());
    return response;
  };
}

// Routes that handle their own CSRF
const SELF_HANDLED_CSRF_ROUTES = [
  "/api/tenants/maintenance",
  "/api/tenant/payments",
  "/api/tenant/change-password",
  "/api/tenant/profile",
];

// Routes that are exempt from CSRF (safe operations)
const CSRF_EXEMPT_ROUTES = [
  "/api/revert-impersonation", // Called during impersonation from tenant view
];

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
  "/api/tenants/:tenantId": { roles: ["propertyOwner"], isApi: true },
  "/api/tenant/profile": { roles: ["tenant", "propertyOwner"], isApi: true },
  "/api/tenants/check-dues": { roles: ["propertyOwner", "tenant"], isApi: true },
  "/api/tenants/maintenance": { roles: ["tenant", "propertyOwner"], isApi: true },
  "/api/update-wallet": { roles: ["propertyOwner"], isApi: true },
  "/api/impersonate": { roles: ["propertyOwner"], isApi: true },
  "/api/revert-impersonation": { roles: ["propertyOwner", "tenant"], isApi: true },
  "/api/ownerstats": { roles: ["propertyOwner"], isApi: true },
  "/api/ownercharts": { roles: ["propertyOwner"], isApi: true },

  // Page routes
  "/properties": { roles: ["propertyOwner", "tenant"], isApi: false },
  "/tenants": { roles: ["propertyOwner"], isApi: false },
  "/property-owner-dashboard": { roles: ["propertyOwner"], isApi: false },
  "/tenant-dashboard": { roles: ["tenant", "propertyOwner"], isApi: false },
  "/property-listings": { roles: [], isApi: false },
};

const ADMIN_API_PATHS = [
  "/api/admin/property-owners",
  "/api/admin/properties",
  "/api/admins",
  "/api/users",
];

export async function proxy(request: NextRequest) {
  const fullPath = request.nextUrl.pathname;
  const path = fullPath.split("?")[0];
  const method = request.method;

  // Bypass static/assets
  if (path.startsWith("/_next/") || path === "/favicon.ico") {
    return NextResponse.next();
  }

  // Public endpoints
  if (path === "/api/public-properties" && method === "GET") {
    return NextResponse.next();
  }

  // Redirect old property detail URLs
  if (path.match(/^\/properties\/[^\/]+$/)) {
    const id = path.split("/")[2];
    return NextResponse.redirect(new URL(`/property-listings/${id}`, request.url));
  }

  const startTime = Date.now();
  logger.debug("Proxy request", { path, method });

  try {
    const cookies = request.cookies;
    const role = cookies.get("role")?.value as Role;
    const userId = cookies.get("userId")?.value;
    const isImpersonating = cookies.get("isImpersonating")?.value === "true";
    const impersonatingTenantId = cookies.get("impersonatingTenantId")?.value;

    // CSRF token generation endpoint
    if (path === "/api/csrf-token") {
      const token = generateCsrfToken();
      const res = NextResponse.json({ success: true, csrfToken: token });
      res.cookies.set("csrf-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 3600,
        path: "/",
      });
      return res;
    }

    // Find matching route (with support for dynamic :tenantId)
    let matchedRoute = Object.keys(routeAccessMap).find((r) => {
      if (path === r) return true;
      if (r === "/api/tenants/:tenantId" && /^\/api\/tenants\/[a-zA-Z0-9]{24}$/.test(path)) {
        return true;
      }
      if (path.startsWith(r + "/")) return true;
      return false;
    });

    const config = matchedRoute ? routeAccessMap[matchedRoute] : null;

    // No rules defined → allow
    if (!config) {
      return NextResponse.next();
    }

    // Public routes
    if (config.roles.length === 0) {
      return NextResponse.next();
    }

    // Must be authenticated
    if (!userId || !role) {
      return config.isApi
        ? NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
        : NextResponse.redirect(new URL("/login", request.url));
    }

    // Allow propertyOwner access to tenant routes during impersonation
    const effectiveRole = (isImpersonating && config.roles.includes("tenant")) ? "tenant" : role;

    if (!config.roles.includes(effectiveRole)) {
      logger.warn("Forbidden access attempt", { path, role, allowed: config.roles });
      return config.isApi
        ? NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
        : NextResponse.redirect(new URL("/login", request.url));
    }

    // Prevent real tenants from accessing other tenants' data
    if (
      role === "tenant" &&
      !isImpersonating &&
      path.startsWith("/api/tenants/") &&
      !path.startsWith("/api/tenants/maintenance") &&
      !path.startsWith("/api/tenants/profile")
    ) {
      const segments = path.split("/").filter(Boolean);
      if (segments.length >= 3) {
        const tenantIdFromPath = segments[2];
        if (tenantIdFromPath && tenantIdFromPath !== userId) {
          return NextResponse.json({ success: false, message: "Access denied" }, { status: 403 });
        }
      }
    }

    // Apply rate limiting + CSRF for non-GET API calls
    if (config.isApi && method !== "GET") {
      const isAdminApi = ADMIN_API_PATHS.some((p) => path.startsWith(p));
      const isCsrfExempt = CSRF_EXEMPT_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
      const isSelfHandled = SELF_HANDLED_CSRF_ROUTES.some((r) => path === r || path.startsWith(r + "/"));

      const handler = isAdminApi || isSelfHandled || isCsrfExempt
        ? async () => NextResponse.next()
        : csrfMiddleware(async () => NextResponse.next());

      return rateLimitMiddleware(handler)(request);
    }

    logger.info("Request authorized", {
      path,
      method,
      role,
      impersonating: isImpersonating,
      duration: Date.now() - startTime,
    });

    return NextResponse.next();
  } catch (error) {
    logger.error("Proxy middleware error", {
      error: error instanceof Error ? error.message : error,
      path,
      method,
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export const config = {
  matcher: [
    "/api/:path*",
    "/properties/:path*",
    "/property-listings/:path*",
    "/tenant-dashboard/:path*",
    "/property-owner-dashboard/:path*",
  ],
};