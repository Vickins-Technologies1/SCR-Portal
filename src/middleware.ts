import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

type Role = 'admin' | 'propertyOwner' | 'tenant' | null;

interface RouteAccess {
  roles: Role[];
  isApi: boolean;
}

// Custom in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 100; // Max 100 requests per window

function customRateLimiter(ip: string): { success: boolean; remaining: number } {
  const now = Date.now();
  const key = ip || 'unknown';
  const record = rateLimitStore.get(key);

  if (!record || now - record.lastReset > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, lastReset: now });
    console.log(`Rate limiter reset - IP: ${key}`);
    return { success: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  record.count += 1;
  if (record.count > RATE_LIMIT_MAX) {
    console.log(`Rate limit exceeded - IP: ${key}, Count: ${record.count}`);
    return { success: false, remaining: 0 };
  }

  rateLimitStore.set(key, record);
  console.log(`Rate limiter check - IP: ${key}, Remaining: ${RATE_LIMIT_MAX - record.count}`);
  return { success: true, remaining: RATE_LIMIT_MAX - record.count };
}

// Custom CSRF protection
function generateCsrfToken(): string {
  return uuidv4();
}

function validateCsrfToken(req: NextRequest, token: string | null): boolean {
  const storedToken = req.cookies.get('csrf-token')?.value;
  const submittedToken = token || req.headers.get('x-csrf-token');
  return !!submittedToken && storedToken === submittedToken;
}

// CSRF middleware wrapper
function csrfMiddleware(handler: (req: NextRequest) => Promise<NextResponse<unknown>>) {
  return async (req: NextRequest) => {
    let submittedToken: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        submittedToken = body.csrfToken;
        req = new NextRequest(req.url, {
          method: req.method,
          headers: req.headers,
          body: JSON.stringify(body),
        });
        console.log(`CSRF token extracted from body - Path: ${req.nextUrl.pathname}, Token: ${submittedToken}`);
      } catch {
        console.log(`No JSON body found for CSRF validation - Path: ${req.nextUrl.pathname}`);
      }
    } else {
      submittedToken = req.headers.get('x-csrf-token');
      console.log(`CSRF token extracted from header - Path: ${req.nextUrl.pathname}, Token: ${submittedToken}`);
    }

    if (!validateCsrfToken(req, submittedToken)) {
      console.log(`CSRF validation failed - Path: ${req.nextUrl.pathname}, Stored: ${req.cookies.get('csrf-token')?.value}, Submitted: ${submittedToken}`);
      return NextResponse.json(
        { success: false, message: 'CSRF token validation failed' },
        { status: 403 }
      );
    }
    return handler(req);
  };
}

// Rate limit middleware wrapper
function rateLimitMiddleware(handler: (req: NextRequest) => Promise<NextResponse<unknown>>) {
  return async (req: NextRequest) => {
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
    const rateLimitResult = customRateLimiter(ip);

    if (!rateLimitResult.success) {
      console.log(`Rate limit exceeded response - IP: ${ip}, Path: ${req.nextUrl.pathname}`);
      return NextResponse.json(
        { success: false, message: 'Too many requests, please try again later.' },
        { status: 429 }
      );
    }

    return handler(req);
  };
}

// Define role-based access for routes
const routeAccessMap: { [key: string]: RouteAccess } = {
  '/api/users': { roles: ['admin'], isApi: true },
  '/api/invoices/generate': { roles: ['admin'], isApi: true },
  '/api/admins': { roles: ['admin'], isApi: true },
  '/api/admin/properties': { roles: ['admin'], isApi: true },
  '/api/admin/property-owners': { roles: ['admin'], isApi: true },
  '/api/payments': { roles: ['admin', 'propertyOwner', 'tenant'], isApi: true },
  '/api/tenant/payments': { roles: ['tenant'], isApi: true },
  '/api/invoices': { roles: ['admin', 'propertyOwner'], isApi: true },
  '/api/properties': { roles: ['propertyOwner', 'tenant'], isApi: true },
  '/api/tenants': { roles: ['propertyOwner', 'tenant'], isApi: true },
  '/api/tenant/profile': { roles: ['tenant'], isApi: true },
  '/api/maintenance': { roles: ['tenant'], isApi: true },
  '/api/update-wallet': { roles: ['propertyOwner'], isApi: true },
  '/api/impersonate': { roles: ['propertyOwner'], isApi: true },
  '/api/impersonate/revert': { roles: ['tenant'], isApi: true },
  '/properties': { roles: ['propertyOwner', 'tenant'], isApi: false },
  '/tenants': { roles: ['propertyOwner', 'tenant'], isApi: false },
  '/property-owner-dashboard': { roles: ['propertyOwner'], isApi: false },
  '/tenant-dashboard': { roles: ['tenant'], isApi: false },
};

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const method = request.method;

  // Skip middleware for Webpack HMR and static assets
  if (path.startsWith('/_next/static/') || path === '/_next/webpack-hmr') {
    console.log(`Skipping middleware for static or HMR path - Path: ${path}, Method: ${method}`);
    return NextResponse.next();
  }

  const startTime = Date.now();
  console.log(`Middleware processing - Path: ${path}, Method: ${method}`);

  try {
    const cookieStore = request.cookies;
    const role = cookieStore.get('role')?.value as Role;
    const userId = cookieStore.get('userId')?.value;

    if (path === '/api/csrf-token') {
      const csrfToken = generateCsrfToken();
      console.log(`Generated CSRF token - Path: ${path}, Token: ${csrfToken}`);
      const response = NextResponse.json({ success: true, csrfToken });
      response.cookies.set('csrf-token', csrfToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60 * 60, // 1 hour
      });
      return response;
    }

    const matchedRoute = Object.keys(routeAccessMap).find((route) => path === route || path.startsWith(`${route}/`));
    const routeConfig = matchedRoute ? routeAccessMap[matchedRoute] : null;

    console.log(`Route match - Path: ${path}, MatchedRoute: ${matchedRoute}, RouteConfig: ${JSON.stringify(routeConfig)}`);

    if (!routeConfig) {
      console.log(`No route config matched. Allowing request - Path: ${path}, Method: ${method}`);
      return NextResponse.next();
    }

    if (!userId || !role) {
      console.log(`Missing auth cookies - Path: ${path}, Method: ${method}, UserId: ${userId}, Role: ${role}`);
      if (routeConfig.isApi) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: Missing user ID or role' },
          { status: 401 }
        );
      }
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Special handling for /api/tenants/:tenantId (excluding /api/tenant/*)
    if (path.startsWith('/api/tenants/') && !path.startsWith('/api/tenant/') && role === 'tenant') {
      const tenantId = path.split('/')[3];
      if (tenantId !== userId) {
        console.log(`Tenant unauthorized to access another tenant's data - Path: ${path}, Method: ${method}, UserId: ${userId}, Role: ${role}, TenantId: ${tenantId}`);
        return NextResponse.json(
          { success: false, message: 'Unauthorized: Cannot access other tenant’s data' },
          { status: 403 }
        );
      }
    } else if (!routeConfig.roles.includes(role)) {
      console.log(`Unauthorized role access - Path: ${path}, Method: ${method}, UserId: ${userId}, Role: ${role}, Allowed: ${routeConfig.roles.join(', ')}`);
      if (routeConfig.isApi) {
        return NextResponse.json(
          { success: false, message: 'Unauthorized: Insufficient role permissions' },
          { status: 403 }
        );
      }
      return NextResponse.redirect(new URL('/', request.url));
    }

    // Apply CSRF and rate-limiting for non-GET API requests
    if (routeConfig.isApi && method !== 'GET') {
      console.log(`Applying CSRF & rate limit - Path: ${path}, Method: ${method}`);
      return rateLimitMiddleware(csrfMiddleware(async () => NextResponse.next()))(request);
    }

    console.log(`Request allowed - Path: ${path}, Method: ${method}, UserId: ${userId}, Role: ${role}, Duration: ${Date.now() - startTime}ms`);
    return NextResponse.next();
  } catch {
    console.log(`Middleware error - Path: ${path}, Method: ${method}`, {
      message: 'Unknown error',
    });

    const isApi = path.startsWith('/api/');
    if (isApi) {
      return NextResponse.json({ success: false, message: 'Internal server error' }, { status: 500 });
    }
    return NextResponse.redirect(new URL('/', request.url));
  }
}

export const config = {
  matcher: [
    '/api/users/:path*',
    '/api/payments/:path*',
    '/api/tenant/payments',
    '/api/tenant/payments/:path*',
    '/api/tenant/profile',
    '/api/maintenance',
    '/api/invoices/:path*',
    '/api/invoices/generate/:path*',
    '/api/admins/:path*',
    '/api/admin/properties/:path*',
    '/api/admin/property-owners/:path*',
    '/api/properties/:path*',
    '/api/tenants/:path*',
    '/api/update-wallet/:path*',
    '/api/csrf-token/:path*',
    '/api/impersonate/:path*',
    '/api/impersonate/revert/:path*',
    '/properties/:path*',
    '/tenants/:path*',
    '/property-owner-dashboard/:path*',
    '/tenant-dashboard/:path*',
  ],
};