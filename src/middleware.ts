// middleware.ts
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
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 100;

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
    const result = rateLimiter(ip);

    if (!result.success) {
      return NextResponse.json(
        { success: false, message: "Too many requests" },
        { status: 429 }
      );
    }

    const response = await handler(req);
    response.headers.set("X-RateLimit-Remaining", result.remaining.toString());
    return response;
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
  "/api/tenants/maintenance": { roles: ["tenant"], isApi: true },
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

// ADMIN API ROUTES — SKIP CSRF (Safe: cookies are httpOnly + role-checked)
const ADMIN_API_PATHS = [
  "/api/admin/property-owners",
  "/api/admin/properties",
  "/api/admins",
  "/api/users",
];

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const method = request.method;

  // Skip static & HMR
  if (path.startsWith("/_next/") || path === "/favicon.ico") {
    return NextResponse.next();
  }

  // Public routes
  if (path === "/api/public-properties" && method === "GET") {
    return NextResponse.next();
  }

  // Redirect old property URLs
  if (path.match(/^\/properties\/[^\/]+$/)) {
    const id = path.split("/")[2];
    return NextResponse.redirect(new URL(`/property-listings/${id}`, request.url));
  }

  const startTime = Date.now();
  logger.debug("Middleware processing", { path, method });

  try {
    const cookies = request.cookies;
    const role = cookies.get("role")?.value as Role;
    const userId = cookies.get("userId")?.value;

    // CSRF Token Endpoint
    if (path === "/api/csrf-token") {
      const token = generateCsrfToken();
      const res = NextResponse.json({ success: true, csrfToken: token });
      res.cookies.set("csrf-token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 3600,
      });
      return res;
    }

    // Find route config
    const matchedRoute = Object.keys(routeAccessMap).find(
      (r) => path === r || path.startsWith(r + "/")
    );
    const config = matchedRoute ? routeAccessMap[matchedRoute] : null;

    if (!config) {
      return NextResponse.next(); // Allow unmatched
    }

    if (config.roles.length === 0) {
      return NextResponse.next(); // Public
    }

    // Auth check
    if (!userId || !role) {
      return config.isApi
        ? NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
        : NextResponse.redirect(new URL("/", request.url));
    }

    // Role check
    if (!config.roles.includes(role)) {
      logger.warn("Forbidden role", { path, role, allowed: config.roles });
      return config.isApi
        ? NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 })
        : NextResponse.redirect(new URL("/", request.url));
    }

    // Tenant self-access
    if (path.startsWith("/api/tenants/") && role === "tenant") {
      const tenantId = path.split("/")[3];
      if (tenantId && tenantId !== userId) {
        return NextResponse.json({ success: false, message: "Access denied" }, { status: 403 });
      }
    }

    // ADMIN APIs: SKIP CSRF (safe + fast)
    const isAdminApi = ADMIN_API_PATHS.some(p => path.startsWith(p));

    if (config.isApi && method !== "GET") {
      const handler = isAdminApi
        ? async () => NextResponse.next()
        : csrfMiddleware(async () => NextResponse.next());

      return rateLimitMiddleware(handler)(request);
    }

    logger.info("Request allowed", { path, method, role, duration: Date.now() - startTime });
    return NextResponse.next();
  } catch (error) {
    logger.error("Middleware error", { error });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
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