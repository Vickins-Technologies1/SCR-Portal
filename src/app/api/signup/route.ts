// src/app/api/signup/route.ts
import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import validator from "validator";
import sanitizeHtml from "sanitize-html";
import { buildInvalidCsrfResponse, validateCsrfToken } from "../../../lib/csrf";
import logger from "../../../lib/logger";
import bcrypt from "bcrypt";

// ──────────────────────────────────────────────────────────────
// In-memory rate limiter (IP-based, 5 attempts / 15 min)
// WARNING: In-memory → lost on restart, not shared between instances
// Consider Upstash/Redis or edge rate limiting in production
// ──────────────────────────────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5;

function customRateLimiter(ip: string): { success: boolean; remaining: number } {
  const now = Date.now();
  const key = ip || "unknown";
  let record = rateLimitStore.get(key);

  if (!record || now - record.lastReset > RATE_LIMIT_WINDOW_MS) {
    record = { count: 1, lastReset: now };
    rateLimitStore.set(key, record);
    logger.debug(`Rate limiter reset - IP: ${key}`);
    return { success: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  record.count += 1;
  rateLimitStore.set(key, record);

  if (record.count > RATE_LIMIT_MAX) {
    logger.warn(`Rate limit exceeded - IP: ${key}`, { count: record.count });
    return { success: false, remaining: 0 };
  }

  logger.debug(`Rate limiter check - IP: ${key}, Remaining: ${RATE_LIMIT_MAX - record.count}`);
  return { success: true, remaining: RATE_LIMIT_MAX - record.count };
}

// ──────────────────────────────────────────────────────────────
// Request body interface
// ──────────────────────────────────────────────────────────────
interface SignupRequestBody {
  name: string;
  email: string;
  password: string;
  phone: string;
  confirmPassword?: string;
  role: string;
  managementType?: string;
  csrfToken: string;
}

// ──────────────────────────────────────────────────────────────
// POST handler
// ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  let body: SignupRequestBody | undefined;

  try {
    // 1. Rate limiting
    const { success: rlOk, remaining } = customRateLimiter(ip);
    if (!rlOk) {
      return NextResponse.json(
        { success: false, message: "Too many signup attempts. Please try again later.", remaining },
        { status: 429 }
      );
    }

    // 2. Parse JSON
    body = await request.json();
    logger.debug("Received signup request:", { email: body?.email ?? "unknown", ip });

    if (!body) {
      logger.warn("Request body is missing");
      return NextResponse.json(
        { success: false, message: "Request body is missing" },
        { status: 400 }
      );
    }

    const { name, email, password, phone, role, csrfToken, managementType } = body;

    // 3. Required fields
    if (!name || !email || !password || !phone || !role || !csrfToken) {
      logger.warn("Missing required fields", { provided: Object.keys(body) });
      return NextResponse.json(
        { success: false, message: "All fields are required" },
        { status: 400 }
      );
    }

    const normalizedManagementType =
      typeof managementType === "string" ? managementType.trim().toLowerCase() : "rentals";

    if (!["rentals", "airbnb"].includes(normalizedManagementType)) {
      logger.warn("Invalid management type", { managementType });
      return NextResponse.json(
        { success: false, message: "Invalid management type" },
        { status: 400 }
      );
    }

    // 4. CSRF protection
    const headerCsrf = request.headers.get("x-csrf-token");
    if (!headerCsrf || headerCsrf !== csrfToken || !validateCsrfToken(request, csrfToken)) {
      logger.warn("Invalid CSRF token", { provided: csrfToken });
      return buildInvalidCsrfResponse(request);
    }

    // 5. Role validation (strict)
    if (role !== "propertyOwner") {
      logger.warn("Invalid role attempted", { role });
      return NextResponse.json(
        { success: false, message: "Invalid role" },
        { status: 400 }
      );
    }

    // 6. Sanitize inputs
    const sanitizedName = sanitizeHtml(name, { allowedTags: [], allowedAttributes: {} });
    const sanitizedEmail = sanitizeHtml(email, { allowedTags: [], allowedAttributes: {} });
    const sanitizedPhone = sanitizeHtml(phone, { allowedTags: [], allowedAttributes: {} });

    // 7. Email validation
    if (!validator.isEmail(sanitizedEmail)) {
      logger.warn("Invalid email format", { email: sanitizedEmail });
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    // 8. Phone validation
    if (!validator.isMobilePhone(sanitizedPhone, "any", { strictMode: true })) {
      logger.warn("Invalid phone number", { phone: sanitizedPhone });
      return NextResponse.json(
        { success: false, message: "Invalid phone number. Use international format (e.g. +254712345678)" },
        { status: 400 }
      );
    }

    // 9. Password validation ── now returns structured errors
    const passwordErrors: string[] = [];
    if (password.length < 8) {
      passwordErrors.push("at least 8 characters");
    }
    if (!/[A-Z]/.test(password)) {
      passwordErrors.push("at least one uppercase letter");
    }
    if (!/[a-z]/.test(password)) {
      passwordErrors.push("at least one lowercase letter");
    }
    if (!/\d/.test(password)) {
      passwordErrors.push("at least one number");
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password)) {
      passwordErrors.push("at least one special character");
    }

    if (passwordErrors.length > 0) {
      logger.warn("Weak password attempt", { email: sanitizedEmail, issues: passwordErrors });

      return NextResponse.json(
        {
          success: false,
          message: "Password requirements not met",
          field: "password",
          errors: passwordErrors,
        },
        { status: 400 }
      );
    }

    // 10. Database connection
    if (!process.env.MONGODB_URI) {
      logger.error("Missing MONGODB_URI environment variable");
      throw new Error("Database configuration error");
    }
    const { db } = await connectToDatabase();
    logger.debug("Connected to database");

    // 11. Check for duplicate email (case-insensitive)
    const existingUser = await db
      .collection("propertyOwners")
      .findOne({ email: new RegExp(`^${sanitizedEmail}$`, "i") });

    if (existingUser) {
      logger.warn("Email already registered", { email: sanitizedEmail });
      return NextResponse.json(
        { success: false, message: "Email already registered" },
        { status: 409 }
      );
    }

    // 12. Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // 13. Create new property owner (pending approval)
    const newUser = {
      name: sanitizedName.trim(),
      email: sanitizedEmail.toLowerCase().trim(),
      password: hashedPassword,
      phone: sanitizedPhone.trim(),
      role: "propertyOwner",
      managementType: normalizedManagementType,
      isApproved: false,
      createdAt: new Date().toISOString(),
    };

    const result = await db.collection("propertyOwners").insertOne(newUser);
    const userId = result.insertedId.toString();

    // 14. Audit log
    await db.collection("auditLogs").insertOne({
      action: "signup",
      userId,
      email: sanitizedEmail,
      ip,
      timestamp: new Date().toISOString(),
      status: "success",
      pendingApproval: true,
    });

    logger.info("Property owner created (pending approval)", { userId, email: sanitizedEmail });

    // 15. Success response
    const response = NextResponse.json(
      {
        success: true,
        message:
          "Account created successfully. It is pending admin approval.\n" +
          "You will be notified by email once your account is activated.",
      },
      { status: 201 }
    );

    // Security headers
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline';"
    );

    return response;
  } catch (error) {
    logger.error("Signup error", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: body ? { ...body, password: "[REDACTED]" } : "N/A",
      ip,
    });

    // Best-effort audit log for failure
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
      logger.error("Failed to write audit log on error", { error: logErr });
    }

    return NextResponse.json(
      { success: false, message: "Internal server error. Please try again later." },
      { status: 500 }
    );
  }
}
