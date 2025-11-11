import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import validator from "validator";
import sanitizeHtml from "sanitize-html";
import { validateCsrfToken } from "../../../lib/csrf";
import logger from "../../../lib/logger";

// ──────────────────────────────────────────────────────────────
// In-memory rate limiter (IP-based, 5 attempts / 15 min)
// ──────────────────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5; // max attempts

function customRateLimiter(ip: string): { success: boolean; remaining: number } {
  const now = Date.now();
  const key = ip || "unknown";
  const record = rateLimitStore.get(key);

  if (!record || now - record.lastReset > RATE_LIMIT_WINDOW_MS) {
    rateLimitStore.set(key, { count: 1, lastReset: now });
    logger.debug(`Rate limiter reset - IP: ${key}`);
    return { success: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  record.count += 1;
  if (record.count > RATE_LIMIT_MAX) {
    logger.warn(`Rate limit exceeded - IP: ${key}`, { count: record.count });
    return { success: false, remaining: 0 };
  }

  rateLimitStore.set(key, record);
  logger.debug(`Rate limiter check - IP: ${key}, Remaining: ${RATE_LIMIT_MAX - record.count}`);
  return { success: true, remaining: RATE_LIMIT_MAX - record.count };
}

// ──────────────────────────────────────────────────────────────
// Request body interface (exactly what the front-end sends)
// ──────────────────────────────────────────────────────────────
interface SignupRequestBody {
  name: string;
  email: string;
  password: string;
  phone: string;          // already includes country code, e.g. "+254712345678"
  confirmPassword?: string; // not used on server – validated client-side
  role: string;           // always "propertyOwner"
  csrfToken: string;
}

// ──────────────────────────────────────────────────────────────
// POST handler
// ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  let body: SignupRequestBody | undefined;

  try {
    // ---------- 1. Rate limiting ----------
    const { success: rlOk } = customRateLimiter(ip);
    if (!rlOk) {
      throw new Error("Too many signup attempts. Please try again later.");
    }

    // ---------- 2. Parse JSON ----------
    body = await request.json();
    logger.debug("Received signup request:", { email: body?.email ?? "unknown", ip });

    if (!body) {
      logger.warn("Request body is missing");
      return NextResponse.json(
        { success: false, message: "Request body is missing" },
        { status: 400 }
      );
    }

    const { name, email, password, phone, role, csrfToken } = body;

    // ---------- 3. Required fields ----------
    if (!name || !email || !password || !phone || !role || !csrfToken) {
      logger.warn("Missing fields", { ...body });
      return NextResponse.json(
        { success: false, message: "All fields are required" },
        { status: 400 }
      );
    }

    // ---------- 4. CSRF (header + body) ----------
    const headerCsrf = request.headers.get("x-csrf-token");
    if (!headerCsrf || headerCsrf !== csrfToken || !validateCsrfToken(request, csrfToken)) {
      logger.warn("Invalid CSRF token", { provided: csrfToken });
      return NextResponse.json(
        { success: false, message: "Invalid CSRF token" },
        { status: 403 }
      );
    }

    // ---------- 5. Role ----------
    if (role !== "propertyOwner") {
      logger.warn("Invalid role", { role });
      return NextResponse.json(
        { success: false, message: "Role must be 'propertyOwner'" },
        { status: 400 }
      );
    }

    // ---------- 6. Sanitize ----------
    const sanitizedName = sanitizeHtml(name, { allowedTags: [], allowedAttributes: {} });
    const sanitizedEmail = sanitizeHtml(email, { allowedTags: [], allowedAttributes: {} });
    const sanitizedPhone = sanitizeHtml(phone, { allowedTags: [], allowedAttributes: {} });

    // ---------- 7. Email validation ----------
    if (!validator.isEmail(sanitizedEmail)) {
      logger.warn("Invalid email", { email: sanitizedEmail });
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    // ---------- 8. Phone validation (already includes country code) ----------
    // Accepts: +2547xxxxxxxx or 7xxxxxxxx (Kenyan) – but also any +[code] followed by 6-15 digits
    if (!/^(\+?\d{1,4})?\d{6,15}$/.test(sanitizedPhone)) {
      logger.warn("Invalid phone", { phone: sanitizedPhone });
      return NextResponse.json(
        { success: false, message: "Invalid phone number (e.g., +254712345678)" },
        { status: 400 }
      );
    }

    // ---------- 9. Password complexity ----------
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      logger.warn("Weak password", { length: password.length });
      return NextResponse.json(
        {
          success: false,
          message:
            "Password must be ≥8 chars, contain uppercase, lowercase, number & special character",
        },
        { status: 400 }
      );
    }

    // ---------- 10. DB connection ----------
    if (!process.env.MONGODB_URI) {
      logger.error("Missing MONGODB_URI");
      throw new Error("Database configuration error");
    }
    const { db } = await connectToDatabase();
    logger.debug("Connected to database");

    // ---------- 11. Duplicate email (case-insensitive) ----------
    const existingUser = await db
      .collection("propertyOwners")
      .findOne({ email: new RegExp(`^${sanitizedEmail}$`, "i") });

    if (existingUser) {
      logger.warn("Email already registered", { email: sanitizedEmail });
      return NextResponse.json(
        { success: false, message: "Email already registered" },
        { status: 400 }
      );
    }

    // ---------- 12. Insert new owner ----------
    const newUser = {
      name: sanitizedName,
      email: sanitizedEmail.toLowerCase(),
      password: password, // TODO: hash in production!
      phone: sanitizedPhone,
      role: "propertyOwner",
      createdAt: new Date().toISOString(),
    };

    const result = await db.collection("propertyOwners").insertOne(newUser);
    const userId = result.insertedId.toString();

    // ---------- 13. Audit log (success) ----------
    await db.collection("auditLogs").insertOne({
      action: "signup",
      userId,
      email: sanitizedEmail,
      ip,
      timestamp: new Date().toISOString(),
      status: "success",
    });

    logger.info("Property owner created", { userId, email: sanitizedEmail });

    // ---------- 14. Response with security headers ----------
    const response = NextResponse.json(
      {
        success: true,
        userId,
        role: "propertyOwner",
        message: "Account created successfully",
      },
      { status: 201 }
    );

    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    );

    return response;
  } catch (error) {
    // ────────────────────────────────────────────────────────
    // Centralised error handling + audit log (failure)
    // ────────────────────────────────────────────────────────
    logger.error("Signup error", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: body ? { ...body, password: "[redacted]" } : "N/A",
      ip,
    });

    // Try to log the failure (fire-and-forget)
    try {
      const { db } = await connectToDatabase();
      await db.collection("auditLogs").insertOne({
        action: "signup",
        email: body?.email || "unknown",
        ip,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } catch (logErr) {
      logger.error("Failed to write audit log", { error: logErr });
    }

    // Specific user-facing messages
    if (error instanceof Error) {
      if (error.message === "Too many signup attempts. Please try again later.") {
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 429 }
        );
      }
      if (error.message.includes("Database configuration error")) {
        return NextResponse.json(
          { success: false, message: "Server misconfigured – contact support" },
          { status: 500 }
        );
      }
    }

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}