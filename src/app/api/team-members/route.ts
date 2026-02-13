// src/app/api/team-members/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { TeamMember } from "@/types/db";
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import validator from "validator";
import sanitizeHtml from "sanitize-html";
import { validateCsrfToken } from "@/lib/csrf";

// Rate limiter
const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

function customRateLimiter(ip: string): { success: boolean; remaining: number } {
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
    logger.warn(`Rate limit exceeded for team member creation - IP: ${key}`, { count: record.count });
    return { success: false, remaining: 0 };
  }

  return { success: true, remaining: RATE_LIMIT_MAX - record.count };
}

interface CreateTeamMemberBody {
  ownerId: string;
  name: string;
  email: string;
  phone?: string;
  teamRole: string;
  permissions: string[];
  password: string;
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    const rl = customRateLimiter(ip);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Please try again later." },
        { status: 429 }
      );
    }

    const body: CreateTeamMemberBody = await req.json();

    const { ownerId, name, email, phone, teamRole, permissions, password } = body;

    if (!ownerId || !name || !email || !teamRole || !password) {
      return NextResponse.json(
        { success: false, message: "Missing required fields (ownerId, name, email, teamRole, password)" },
        { status: 400 }
      );
    }

    const submittedCsrf = req.headers.get("x-csrf-token") || "";
    const storedCsrf = req.cookies.get("csrf-token")?.value || "";
    if (!submittedCsrf || submittedCsrf !== storedCsrf || !validateCsrfToken(req, submittedCsrf)) {
      logger.warn("Invalid CSRF token for team member creation", { ip });
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    if (!sessionUserId || sessionUserId !== ownerId) {
      logger.warn("Unauthorized team member creation attempt", { sessionUserId, requestedOwner: ownerId, ip });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const sanitizedName = sanitizeHtml(name.trim(), { allowedTags: [] });
    const sanitizedEmail = sanitizeHtml(email.trim().toLowerCase(), { allowedTags: [] });
    const sanitizedPhone = phone ? sanitizeHtml(phone.trim(), { allowedTags: [] }) : undefined;

    if (!validator.isEmail(sanitizedEmail)) {
      return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return NextResponse.json(
        {
          success: false,
          message: "Password must contain uppercase, lowercase, number, and special character",
        },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const existing = await db.collection("teamMembers").findOne({
      ownerId: new ObjectId(ownerId),
      email: sanitizedEmail,
    });

    if (existing) {
      return NextResponse.json(
        { success: false, message: "A team member with this email already exists under your account" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const now = new Date();

    const newMember = {
      ownerId: new ObjectId(ownerId),
      name: sanitizedName,
      email: sanitizedEmail,
      phone: sanitizedPhone,
      role: "teamMember",                        // ← Required for sign-in logic
      teamRole,                                  // ← Specific title (Manager, Assistant, etc.)
      permissions: Array.isArray(permissions) ? permissions : [],
      password: hashedPassword,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("teamMembers").insertOne(newMember);

    const createdMember = {
      _id: result.insertedId.toString(),
      ownerId: ownerId,
      name: sanitizedName,
      email: sanitizedEmail,
      phone: sanitizedPhone,
      role: "teamMember",
      teamRole,
      permissions: newMember.permissions,
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await db.collection("auditLogs").insertOne({
      action: "team_member_created",
      ownerId,
      memberId: result.insertedId.toString(),
      email: sanitizedEmail,
      ip,
      timestamp: now.toISOString(),
      status: "success",
    });

    logger.info("Team member created successfully", {
      ownerId,
      memberId: result.insertedId.toString(),
      email: sanitizedEmail,
      teamRole,
    });

    return NextResponse.json(
      {
        success: true,
        member: createdMember,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("POST /api/team-members failed", {
      error: error instanceof Error ? error.message : String(error),
      ip,
    });

    // Safer audit log (avoid re-awaiting body)
    try {
      const { db } = await connectToDatabase();
      await db.collection("auditLogs").insertOne({
        action: "team_member_creation_failed",
        ownerId: "unknown",
        email: "unknown",
        ip,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } catch (logErr) {
      logger.error("Failed to write audit log for failed creation", { error: logErr });
    }

    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    const ownerIdParam = req.nextUrl.searchParams.get("ownerId");
    if (!ownerIdParam) {
      return NextResponse.json(
        { success: false, message: "ownerId query parameter is required" },
        { status: 400 }
      );
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    if (!sessionUserId || sessionUserId !== ownerIdParam) {
      logger.warn("Unauthorized team members access attempt", { requestedOwner: ownerIdParam });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<TeamMember>("teamMembers");

    const members = await collection
      .find({ ownerId: new ObjectId(ownerIdParam) })
      .sort({ createdAt: -1 })
      .toArray();

    const serialized = members.map((m) => ({
      _id: m._id?.toString(),
      ownerId: m.ownerId.toString(),
      name: m.name,
      email: m.email,
      phone: m.phone,
      role: m.role || "teamMember",               // fallback for old docs
      teamRole: m.teamRole || "Team Member",
      permissions: m.permissions || [],
      active: m.active,
      createdAt: m.createdAt?.toISOString(),
      updatedAt: m.updatedAt?.toISOString(),
      lastActive: m.lastActive,
    }));

    return NextResponse.json({
      success: true,
      members: serialized,
    });
  } catch (error) {
    logger.error("GET /api/team-members failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}