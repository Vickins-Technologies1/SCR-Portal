import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import validator from "validator";
import sanitizeHtml from "sanitize-html";
import { validateCsrfToken } from "../../../lib/csrf";
import logger from "../../../lib/logger";

// In-memory rate limiter store
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 5; // 5 attempts

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
    logger.warn(`Rate limit exceeded - IP: ${key}, Count: ${record.count}`);
    return { success: false, remaining: 0 };
  }

  rateLimitStore.set(key, record);
  logger.debug(`Rate limiter check - IP: ${key}, Remaining: ${RATE_LIMIT_MAX - record.count}`);
  return { success: true, remaining: RATE_LIMIT_MAX - record.count };
}

// Define interface for request body
interface SignupRequestBody {
  name: string;
  email: string;
  password: string;
  phone: string;
  confirmPassword: string;
  role: string;
  csrfToken: string;
}

export async function POST(request: NextRequest) {
  // Define variables accessible in both try and catch
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  let body: SignupRequestBody | undefined;

  try {
    // Rate limiting
    const rateLimitResult = customRateLimiter(ip);
    if (!rateLimitResult.success) {
      throw new Error("Too many signup attempts. Please try again later.");
    }

    body = await request.json() as SignupRequestBody;
    logger.debug("Received signup request:", { email: body.email, ip });
    const { name, email, password, phone, confirmPassword, role, csrfToken } = body;

    // Validate input
    if (!name || !email || !password || !phone || !confirmPassword || !role || !csrfToken) {
      logger.warn("Missing fields:", body);
      return NextResponse.json(
        { success: false, message: "All fields are required" },
        { status: 400 }
      );
    }

    // Validate CSRF token using utility function
    if (!validateCsrfToken(request, csrfToken)) {
      logger.warn("Invalid CSRF token:", { provided: csrfToken });
      return NextResponse.json(
        { success: false, message: "Invalid CSRF token" },
        { status: 403 }
      );
    }

    if (role !== "propertyOwner") {
      logger.warn("Invalid role:", role);
      return NextResponse.json(
        { success: false, message: "Role must be 'propertyOwner'" },
        { status: 400 }
      );
    }

    // Sanitize inputs
    const sanitizedName = sanitizeHtml(name, { allowedTags: [], allowedAttributes: {} });
    const sanitizedEmail = sanitizeHtml(email, { allowedTags: [], allowedAttributes: {} });
    const sanitizedPhone = sanitizeHtml(phone, { allowedTags: [], allowedAttributes: {} });

    // Validate email
    if (!validator.isEmail(sanitizedEmail)) {
      logger.warn("Invalid email:", sanitizedEmail);
      return NextResponse.json(
        { success: false, message: "Invalid email format" },
        { status: 400 }
      );
    }

    // Validate phone (Kenyan format: +2547xxxxxxxx or 07xxxxxxxx)
    if (!/^(?:\+2547|7)\d{8}$/.test(sanitizedPhone)) {
      logger.warn("Invalid phone:", sanitizedPhone);
      return NextResponse.json(
        { success: false, message: "Invalid phone number (e.g., +2547xxxxxxxx or 7xxxxxxxx)" },
        { status: 400 }
      );
    }

    // Validate password complexity
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      logger.warn("Weak password");
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters" },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      logger.warn("Passwords do not match");
      return NextResponse.json(
        { success: false, message: "Passwords do not match" },
        { status: 400 }
      );
    }

    // Check environment variables
    if (!process.env.MONGODB_URI) {
      logger.error("Missing MONGODB_URI");
      throw new Error("Database configuration error");
    }

    const { db } = await connectToDatabase();
    logger.debug("Connected to database");

    // Check if email already exists (case-insensitive)
    const existingUser = await db.collection("propertyOwners").findOne({
      email: new RegExp(`^${sanitizedEmail}$`, "i"),
    });
    if (existingUser) {
      logger.warn("Email already exists:", sanitizedEmail);
      return NextResponse.json(
        { success: false, message: "Email already registered" },
        { status: 400 }
      );
    }

    // Create new user without custom _id
    const newUser = {
      name: sanitizedName,
      email: sanitizedEmail.toLowerCase(),
      password: password, // Store password in plain text
      phone: sanitizedPhone,
      role: "propertyOwner",
      createdAt: new Date().toISOString(),
    };

    // Insert new property owner
    const result = await db.collection("propertyOwners").insertOne(newUser);
    const userId = result.insertedId.toString();

    // Log signup attempt
    await db.collection("auditLogs").insertOne({
      action: "signup",
      userId,
      email: sanitizedEmail,
      ip,
      timestamp: new Date().toISOString(),
      status: "success",
    });

    logger.info("Property owner created:", { userId, email: sanitizedEmail });

    // Set security headers
    const response = NextResponse.json(
      { success: true, userId, role: "propertyOwner", message: "Account created successfully" },
      { status: 201 }
    );
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("X-XSS-Protection", "1; mode=block");
    response.headers.set("Content-Security-Policy", "default-src 'self';");

    return response;
  } catch (error) {
    logger.error("Signup error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: body || "Failed to parse request body",
      ip: ip,
    });

    // Log failed signup attempt
    try {
      const { db } = await connectToDatabase();
      await db.collection("auditLogs").insertOne({
        action: "signup",
        email: body?.email || "unknown",
        ip: ip,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } catch (logError) {
      logger.error("Failed to log signup error:", logError);
    }

    if (error instanceof Error) {
      if (error.message === "Too many signup attempts. Please try again later.") {
        return NextResponse.json(
          { success: false, message: error.message },
          { status: 429 }
        );
      }
      if (error.message.includes("Database configuration error")) {
        return NextResponse.json(
          { success: false, message: "Database configuration error: Please check environment variables" },
          { status: 500 }
        );
      }
      if (error.message.includes("Failed to connect to the database")) {
        return NextResponse.json(
          { success: false, message: "Unable to connect to the database. Please try again later." },
          { status: 503 }
        );
      }
    }

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}