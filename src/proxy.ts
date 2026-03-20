// src/proxy.ts (or middleware.ts)
import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import logger from "./lib/logger";

type Role = "admin" | "propertyOwner" | "teamMember" | "tenant" | null;

interface RouteAccess {
  roles: Role[];
  isApi: boolean;
}

// Rate limiting (per IP)
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
  } else {
    record.count += 1;
  }

  rateLimitStore.set(key, record);

  if (record.count > RATE_LIMIT_MAX) {
    return { success: false, remaining: 0 };
  }

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
      logger.warn("CSRF validation failed", {
        path: req.nextUrl.pathname,
        method: req.method,
        ip: req.headers.get("x-forwarded-for") || "unknown",
      });
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }
    return handler(req);
  };
}

function rateLimitMiddleware(handler: (req: NextRequest) => Promise<NextResponse>) {
  return async (req: NextRequest) => {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
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

// Routes that implement their own CSRF validation
const SELF_HANDLED_CSRF_ROUTES = [
  "/api/tenants/maintenance",
  "/api/tenants/vacate",
  "/api/property-owners/vacate",
  "/api/tenant/payments",
  "/api/tenant/change-password",
  "/api/tenant/profile",
  // Add any new routes that handle CSRF internally
];

// Routes completely exempt from CSRF (e.g. logout, public GETs, impersonation revert)
const CSRF_EXEMPT_ROUTES = [
  "/api/revert-impersonation",
  "/api/signout",           // if you have it
  "/api/csrf-token",        // token generation should not require CSRF
];

// Route → allowed roles mapping
const routeAccessMap: { [key: string]: RouteAccess } = {
  // Admin-only APIs
  "/api/users": { roles: ["admin"], isApi: true },
  "/api/invoices/generate": { roles: ["admin"], isApi: true },
  "/api/admins": { roles: ["admin"], isApi: true },
  "/api/admin/properties": { roles: ["admin"], isApi: true },
  "/api/admin/property-owners": { roles: ["admin"], isApi: true },

  // Shared / multi-role APIs
  "/api/payments": { roles: ["admin", "propertyOwner", "teamMember", "tenant"], isApi: true },
  "/api/tenant/payments": { roles: ["tenant", "propertyOwner", "teamMember"], isApi: true },
  "/api/invoices": { roles: ["admin", "propertyOwner", "teamMember"], isApi: true },
  "/api/invoices/estimate": { roles: ["propertyOwner", "teamMember"], isApi: true },
  "/api/properties": { roles: ["propertyOwner", "teamMember", "tenant"], isApi: true },
  "/api/list-properties": { roles: ["propertyOwner", "teamMember"], isApi: true },
  "/api/tenants": { roles: ["propertyOwner", "teamMember"], isApi: true },
  "/api/tenants/:tenantId": { roles: ["propertyOwner", "teamMember"], isApi: true },
  "/api/tenant/profile": { roles: ["tenant", "propertyOwner", "teamMember"], isApi: true },
  "/api/tenants/check-dues": { roles: ["propertyOwner", "teamMember", "tenant"], isApi: true },
  "/api/tenants/maintenance": { roles: ["tenant", "propertyOwner", "teamMember"], isApi: true },
  "/api/tenants/vacate": { roles: ["tenant", "propertyOwner"], isApi: true },
  "/api/property-owners/vacate": { roles: ["propertyOwner", "teamMember"], isApi: true },
  "/api/update-wallet": { roles: ["propertyOwner", "teamMember"], isApi: true },

  // Impersonation
  "/api/impersonate": { roles: ["propertyOwner"], isApi: true },
  "/api/revert-impersonation": { roles: ["propertyOwner", "tenant"], isApi: true },

  // Owner/team stats & charts
  "/api/ownerstats": { roles: ["propertyOwner", "teamMember"], isApi: true },
  "/api/ownercharts": { roles: ["propertyOwner", "teamMember"], isApi: true },

  // Page routes (client-side routing protection)
  "/property-owner-dashboard": { roles: ["propertyOwner", "teamMember"], isApi: false },
  "/tenant-dashboard": { roles: ["tenant", "propertyOwner"], isApi: false },
  "/tenant-dashboard/vacate": { roles: ["tenant", "propertyOwner"], isApi: false },
  "/properties": { roles: ["propertyOwner", "teamMember", "tenant"], isApi: false },
  "/tenants": { roles: ["propertyOwner", "teamMember"], isApi: false },
  "/property-listings": { roles: [], isApi: false }, // public
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
  const { method } = request;

  // Skip static assets & Next.js internals
  if (path.startsWith("/_next/") || path === "/favicon.ico") {
    return NextResponse.next();
  }

  // Fully public GET endpoints
  if (path === "/api/public-properties" && method === "GET") {
    return NextResponse.next();
  }

  // Redirect legacy property URLs
  if (path.match(/^\/properties\/[^\/]+$/)) {
    const id = path.split("/")[2];
    return NextResponse.redirect(new URL(`/property-listings/${id}`, request.url));
  }

  const startTime = Date.now();
  logger.debug("Proxy request", { path, method });

  try {
    const { cookies } = request;
    const role = cookies.get("role")?.value as Role;
    const userId = cookies.get("userId")?.value;
    const isImpersonating = cookies.get("isImpersonating")?.value === "true";
    const impersonatingTenantId = cookies.get("impersonatingTenantId")?.value;

    // CSRF token generation (always allowed)
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

    // Find matching route config (support dynamic segments)
    let matchedRouteKey = Object.keys(routeAccessMap).find((r) => {
      if (path === r) return true;
      if (r.endsWith("/:tenantId") && path.startsWith(r.replace("/:tenantId", ""))) {
        return true;
      }
      if (path.startsWith(r + "/")) return true;
      return false;
    });

    const config = matchedRouteKey ? routeAccessMap[matchedRouteKey] : null;

    // No explicit rule → allow (fallback)
    if (!config) {
      return NextResponse.next();
    }

    // Public routes (empty roles array)
    if (config.roles.length === 0) {
      return NextResponse.next();
    }

    // Must be authenticated
    if (!userId || !role) {
      logger.warn("Unauthenticated access attempt", { path, method });
      return config.isApi
        ? NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
        : NextResponse.redirect(new URL("/", request.url));
    }

    // Determine effective role when impersonating (mainly for tenants)
    let effectiveRole = role;
    if (isImpersonating && config.roles.includes("tenant")) {
      effectiveRole = "tenant";
    }

    // Check role access
    if (!config.roles.includes(effectiveRole)) {
      logger.warn("Forbidden access attempt", {
        path,
        role,
        effectiveRole,
        allowed: config.roles,
        impersonating: isImpersonating,
      });
      return config.isApi
        ? NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
        : NextResponse.redirect(new URL("/unauthorized", request.url));
    }

    // Tenant self-protection: prevent accessing other tenants' data
    if (
      role === "tenant" &&
      !isImpersonating &&
      path.startsWith("/api/tenants/") &&
      !path.startsWith("/api/tenants/maintenance") &&
      !path.startsWith("/api/tenants/profile") &&
      !path.startsWith("/api/tenants/vacate")
    ) {
      const segments = path.split("/").filter(Boolean);
      if (segments.length >= 3) {
        const tenantIdFromPath = segments[2];
        if (tenantIdFromPath && tenantIdFromPath !== userId) {
          logger.warn("Tenant tried to access another tenant's data", {
            tenantId: userId,
            target: tenantIdFromPath,
            path,
          });
          return NextResponse.json({ success: false, message: "Access denied" }, { status: 403 });
        }
      }
    }

    // ── CSRF & Rate limiting ── only apply to mutating methods ──────────────────
    if (config.isApi) {
      const isMutatingMethod = !["GET", "HEAD", "OPTIONS"].includes(method);
      const isAdminApi = ADMIN_API_PATHS.some((p) => path.startsWith(p));
      const isCsrfExempt = CSRF_EXEMPT_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
      const isSelfHandled = SELF_HANDLED_CSRF_ROUTES.some((r) => path === r || path.startsWith(r + "/"));

      let handler = async (req: NextRequest) => NextResponse.next();

      // Only apply CSRF on mutating requests (POST/PUT/DELETE/PATCH)
      if (isMutatingMethod && !isCsrfExempt && !isSelfHandled) {
        handler = csrfMiddleware(handler);
      }

      // Apply rate limiting (you can make this conditional too if desired)
      if (isMutatingMethod && !isAdminApi) {
        handler = rateLimitMiddleware(handler);
      }

      return handler(request);
    }

    logger.info("Request authorized", {
      path,
      method,
      role,
      effectiveRole,
      impersonating: isImpersonating,
      duration: Date.now() - startTime,
    });

    return NextResponse.next();
  } catch (error) {
    logger.error("Proxy middleware error", {
      error: error instanceof Error ? error.message : String(error),
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
    "/tenants/:path*",
  ],
};
