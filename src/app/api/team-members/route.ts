// src/app/api/team-members/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { TeamMember } from "@/types/db";
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import validator from "validator";
import sanitizeHtml from "sanitize-html";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { sendWelcomeSms } from "@/lib/sms";
import { findAnyExistingEmail, isDuplicateKeyError, normalizeEmail } from "@/lib/email-identity";

// Rate limiter (unchanged)
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
  assignedPropertyIds?: string[];
  assignedAirbnbListingIds?: string[];
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
    const {
      ownerId: requestedOwnerId,
      name,
      email,
      phone,
      teamRole,
      permissions,
      assignedPropertyIds,
      assignedAirbnbListingIds,
      password,
    } = body;

    if (!requestedOwnerId || !name || !email || !teamRole || !password) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    const submittedCsrf = req.headers.get("x-csrf-token") || "";
    const storedCsrf = req.cookies.get("csrf-token")?.value || "";
    if (!submittedCsrf || submittedCsrf !== storedCsrf || !validateCsrfToken(req, submittedCsrf)) {
      logger.warn("Invalid CSRF token for team member creation", { ip });
      return buildInvalidCsrfResponse(req);
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    const sessionRole = req.cookies.get("role")?.value || "";
    const sessionOwnerId = req.cookies.get("ownerId")?.value || sessionUserId;

    if (!sessionUserId || sessionOwnerId !== requestedOwnerId) {
      logger.warn("Unauthorized team member creation attempt (owner mismatch)", {
        sessionUserId,
        sessionRole,
        requestedOwner: requestedOwnerId,
        ip,
      });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    // Team members must have "users:manage" permission
    if (sessionRole === "teamMember") {
      const { db } = await connectToDatabase();
      const member = await db.collection("teamMembers").findOne({
        _id: new ObjectId(sessionUserId),
        ownerId: new ObjectId(requestedOwnerId),
        active: true,
      });

      if (!member || !member.permissions?.includes("users:manage")) {
        logger.warn("Team member lacks manage permission", { sessionUserId });
        return NextResponse.json(
          { success: false, message: "Insufficient permissions to manage team members" },
          { status: 403 }
        );
      }
    }

    const sanitizedName = sanitizeHtml(name.trim(), { allowedTags: [] });
    const sanitizedEmail = normalizeEmail(email);
    const sanitizedPhone = phone ? sanitizeHtml(phone.trim(), { allowedTags: [] }) : undefined;

    if (!validator.isEmail(sanitizedEmail)) {
      return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ success: false, message: "Password must be at least 8 characters" }, { status: 400 });
    }

    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return NextResponse.json(
        { success: false, message: "Password must contain uppercase, lowercase, number, and special character" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const existing = await findAnyExistingEmail(db, sanitizedEmail);
    if (existing) {
      return NextResponse.json(
        { success: false, message: "That email is already in use" },
        { status: 409 }
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date();

    const normalizedAssignedPropertyIds = Array.isArray(assignedPropertyIds)
      ? Array.from(
          new Set(
            assignedPropertyIds
              .map((value) => String(value || "").trim())
              .filter((value) => ObjectId.isValid(value))
          )
        )
      : [];

    const normalizedAssignedAirbnbListingIds = Array.isArray(assignedAirbnbListingIds)
      ? Array.from(
          new Set(
            assignedAirbnbListingIds
              .map((value) => String(value || "").trim())
              .filter((value) => value.length > 0)
          )
        )
      : [];

    if (normalizedAssignedPropertyIds.length > 0) {
      const ownerFilter = ObjectId.isValid(requestedOwnerId)
        ? { $in: [requestedOwnerId, new ObjectId(requestedOwnerId)] }
        : requestedOwnerId;
      const owned = await db
        .collection("properties")
        .find({
          ownerId: ownerFilter,
          _id: { $in: normalizedAssignedPropertyIds.map((id) => new ObjectId(id)) },
        })
        .project({ _id: 1 })
        .toArray();
      if (owned.length !== normalizedAssignedPropertyIds.length) {
        return NextResponse.json(
          { success: false, message: "One or more assigned properties are invalid." },
          { status: 400 }
        );
      }
    }

    if (normalizedAssignedAirbnbListingIds.length > 0) {
      const ownedListings = await db
        .collection("airbnbListings")
        .find({ ownerId: requestedOwnerId, externalId: { $in: normalizedAssignedAirbnbListingIds } })
        .project({ externalId: 1 })
        .toArray();
      if (ownedListings.length !== normalizedAssignedAirbnbListingIds.length) {
        return NextResponse.json(
          { success: false, message: "One or more assigned Airbnb listings are invalid." },
          { status: 400 }
        );
      }
    }

    const newMember = {
      ownerId: new ObjectId(requestedOwnerId),
      name: sanitizedName,
      email: sanitizedEmail,
      phone: sanitizedPhone,
      role: "teamMember",
      teamRole,
      permissions: Array.isArray(permissions) ? permissions : [],
      assignedPropertyIds: normalizedAssignedPropertyIds,
      assignedAirbnbListingIds: normalizedAssignedAirbnbListingIds,
      password: hashedPassword,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    let result;
    try {
      result = await db.collection("teamMembers").insertOne(newMember);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        return NextResponse.json({ success: false, message: "That email is already in use" }, { status: 409 });
      }
      throw error;
    }

    const createdMember = {
      _id: result.insertedId.toString(),
      ownerId: requestedOwnerId,
      name: sanitizedName,
      email: sanitizedEmail,
      phone: sanitizedPhone,
      role: "teamMember",
      teamRole,
      permissions: newMember.permissions,
      assignedPropertyIds: newMember.assignedPropertyIds,
      assignedAirbnbListingIds: newMember.assignedAirbnbListingIds,
      active: true,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    await db.collection("auditLogs").insertOne({
      action: "team_member_created",
      ownerId: requestedOwnerId,
      memberId: result.insertedId.toString(),
      email: sanitizedEmail,
      ip,
      timestamp: now.toISOString(),
      status: "success",
    });

    logger.info("Team member created successfully", {
      ownerId: requestedOwnerId,
      memberId: result.insertedId.toString(),
      email: sanitizedEmail,
      teamRole,
    });

    if (sanitizedPhone) {
      const origin = req.headers.get("origin");
      const baseUrl = origin || process.env.APP_URL || "https://app.soranapropertymanagers.com";
      const loginUrl = baseUrl.replace(/\/$/, "");
      const smsMessage =
        `Welcome ${sanitizedName}! Your team member account is ready.\n` +
        `Login: ${sanitizedEmail}\n` +
        `Password: ${password}\n` +
        `Sign in: ${loginUrl}`;
      try {
        await sendWelcomeSms({ phone: sanitizedPhone, message: smsMessage });
      } catch (smsError) {
        logger.error("Failed to send team member login SMS", {
          ownerId: requestedOwnerId,
          memberId: result.insertedId.toString(),
          phone: sanitizedPhone,
          error: smsError instanceof Error ? smsError.message : String(smsError),
        });
      }
    }

    return NextResponse.json({ success: true, member: createdMember }, { status: 201 });
  } catch (error) {
    logger.error("POST /api/team-members failed", { error: String(error), ip });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const ownerIdParam = req.nextUrl.searchParams.get("ownerId");
    if (!ownerIdParam) {
      return NextResponse.json({ success: false, message: "ownerId is required" }, { status: 400 });
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    const sessionRole = req.cookies.get("role")?.value || "";
    const sessionOwnerId = req.cookies.get("ownerId")?.value || sessionUserId;

    if (!sessionUserId || sessionOwnerId !== ownerIdParam) {
      logger.warn("Unauthorized team members access attempt", {
        requestedOwner: ownerIdParam,
        sessionUserId,
        sessionRole,
      });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const { db } = await connectToDatabase();

    // Team members must have "users:view" permission
    if (sessionRole === "teamMember") {
      const member = await db.collection("teamMembers").findOne({
        _id: new ObjectId(sessionUserId),
        ownerId: new ObjectId(ownerIdParam),
        active: true,
      });

      if (!member || !member.permissions?.includes("users:view")) {
        return NextResponse.json(
          { success: false, message: "Insufficient permissions" },
          { status: 403 }
        );
      }
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
      role: m.role || "teamMember",
      teamRole: m.teamRole || "Team Member",
      permissions: m.permissions || [],
      assignedPropertyIds: Array.isArray((m as any).assignedPropertyIds) ? (m as any).assignedPropertyIds : [],
      assignedAirbnbListingIds: Array.isArray((m as any).assignedAirbnbListingIds) ? (m as any).assignedAirbnbListingIds : [],
      active: m.active,
      createdAt: m.createdAt?.toISOString(),
      updatedAt: m.updatedAt?.toISOString(),
      lastActive: m.lastActive,
    }));

    return NextResponse.json({ success: true, members: serialized });
  } catch (error) {
    logger.error("GET /api/team-members failed", { error: String(error) });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
