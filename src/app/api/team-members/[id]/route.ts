// src/app/api/team-members/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import validator from "validator";
import sanitizeHtml from "sanitize-html";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { sendWelcomeSms } from "@/lib/sms";
import { randomBytes } from "crypto";

// ────────────────────────────────────────────────
// Type Definitions
// ────────────────────────────────────────────────

interface TeamMember {
  _id?: string | ObjectId;
  ownerId: string | ObjectId;
  name: string;
  email: string;
  phone?: string;
  role: string;
  teamRole?: string;
  permissions: string[];
  assignedPropertyIds?: string[];
  assignedAirbnbListingIds?: string[];
  password: string;
  active: boolean;
  lastActive?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Safe version for responses (no password, string IDs)
type SafeTeamMember = Omit<TeamMember, "password" | "_id" | "ownerId"> & {
  _id: string;
  ownerId: string;
};

const PASSWORD_CHARSET =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@$!%*?&";

const generateTempPassword = (length = 12) => {
  const bytes = randomBytes(length);
  let password = "";
  for (let i = 0; i < length; i += 1) {
    password += PASSWORD_CHARSET[bytes[i] % PASSWORD_CHARSET.length];
  }
  return password;
};

// ────────────────────────────────────────────────
// Rate limiter (in-memory – use Redis in production)
// ────────────────────────────────────────────────

const rateLimitStore = new Map<string, { count: number; lastReset: number }>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
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
    return { success: false, remaining: 0 };
  }

  return { success: true, remaining: RATE_LIMIT_MAX - record.count };
}

// ────────────────────────────────────────────────
// Helper to safely convert MongoDB doc → frontend-safe object
// ────────────────────────────────────────────────

function toSafeTeamMember(doc: any): SafeTeamMember {
  const { _id, ownerId, password, ...rest } = doc;

  return {
    _id: _id.toString(),
    ownerId: ownerId.toString(),
    name: rest.name ?? "",
    email: rest.email ?? "",
    phone: rest.phone ?? undefined,
    role: rest.role ?? "teamMember",
    teamRole: rest.teamRole ?? "Team Member",
    permissions: rest.permissions ?? [],
    assignedPropertyIds: Array.isArray(rest.assignedPropertyIds) ? rest.assignedPropertyIds : [],
    assignedAirbnbListingIds: Array.isArray(rest.assignedAirbnbListingIds) ? rest.assignedAirbnbListingIds : [],
    active: rest.active ?? true,
    lastActive: rest.lastActive ?? undefined,
    createdAt: rest.createdAt ?? new Date(),
    updatedAt: rest.updatedAt ?? new Date(),
  };
}

// ────────────────────────────────────────────────
// PATCH – Update team member
// ────────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    const rl = customRateLimiter(ip);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    const { id: memberId } = await context.params;
    const { db } = await connectToDatabase();

    const body = await req.json();
    const {
      ownerId,
      name,
      email,
      phone,
      teamRole,
      permissions,
      active,
      password,
      assignedPropertyIds,
      assignedAirbnbListingIds,
    } = body;

    if (!ownerId) {
      return NextResponse.json({ success: false, message: "ownerId required" }, { status: 400 });
    }

    const submittedCsrf = req.headers.get("x-csrf-token") || "";
    const storedCsrf = req.cookies.get("csrf-token")?.value || "";
    if (!submittedCsrf || submittedCsrf !== storedCsrf || !validateCsrfToken(req, submittedCsrf)) {
      logger.warn("Invalid CSRF token on team member PATCH", { ip });
      return buildInvalidCsrfResponse(req);
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    const sessionRole = req.cookies.get("role")?.value || "";

    if (!sessionUserId) {
      logger.warn("Unauthorized PATCH attempt on team member", { sessionUserId, memberId, ip });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<TeamMember>("teamMembers");

    if (sessionRole === "teamMember") {
      const member = await collection.findOne({
        _id: new ObjectId(sessionUserId),
        ownerId: new ObjectId(ownerId),
        active: true,
      });

      if (!member || !member.permissions?.includes("users:manage")) {
        logger.warn("Insufficient permissions for team member PATCH", { sessionUserId, memberId, ip });
        return NextResponse.json(
          { success: false, message: "Insufficient permissions to manage team members" },
          { status: 403 }
        );
      }
    } else if (sessionUserId !== ownerId) {
      logger.warn("Unauthorized PATCH attempt on team member", { sessionUserId, memberId, ip });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    // Email uniqueness check (if email is being updated)
    if (email && typeof email === "string") {
      const sanitizedEmail = sanitizeHtml(email.trim().toLowerCase(), { allowedTags: [] });
      if (!validator.isEmail(sanitizedEmail)) {
        return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
      }

      const existing = await collection.findOne({
        ownerId: new ObjectId(ownerId),
        email: sanitizedEmail,
        _id: { $ne: new ObjectId(memberId) },
      });

      if (existing) {
        return NextResponse.json(
          { success: false, message: "Email already in use by another team member" },
          { status: 409 }
        );
      }
    }

    const updateData: any = {
      $set: {
        updatedAt: new Date(),
      },
    };

    if (name !== undefined) updateData.$set.name = sanitizeHtml(name.trim(), { allowedTags: [] });
    if (email !== undefined) updateData.$set.email = email.trim().toLowerCase();
    if (phone !== undefined) updateData.$set.phone = phone ? sanitizeHtml(phone.trim(), { allowedTags: [] }) : null;
    if (teamRole !== undefined) updateData.$set.teamRole = teamRole;
    if (permissions !== undefined && Array.isArray(permissions)) updateData.$set.permissions = permissions;
    if (active !== undefined) updateData.$set.active = !!active;

    const normalizedAssignedPropertyIds = Array.isArray(assignedPropertyIds)
      ? Array.from(
          new Set(
            assignedPropertyIds
              .map((value: any) => String(value || "").trim())
              .filter((value: string) => ObjectId.isValid(value))
          )
        )
      : null;

    const normalizedAssignedAirbnbListingIds = Array.isArray(assignedAirbnbListingIds)
      ? Array.from(
          new Set(
            assignedAirbnbListingIds
              .map((value: any) => String(value || "").trim())
              .filter((value: string) => value.length > 0)
          )
        )
      : null;

    if (normalizedAssignedPropertyIds) {
      const owned = await db
        .collection("properties")
        .find({
          ownerId: ObjectId.isValid(ownerId) ? { $in: [ownerId, new ObjectId(ownerId)] } : ownerId,
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
      updateData.$set.assignedPropertyIds = normalizedAssignedPropertyIds;
    }

    if (normalizedAssignedAirbnbListingIds) {
      const ownedListings = await db
        .collection("airbnbListings")
        .find({ ownerId, externalId: { $in: normalizedAssignedAirbnbListingIds } })
        .project({ externalId: 1 })
        .toArray();
      if (ownedListings.length !== normalizedAssignedAirbnbListingIds.length) {
        return NextResponse.json(
          { success: false, message: "One or more assigned Airbnb listings are invalid." },
          { status: 400 }
        );
      }
      updateData.$set.assignedAirbnbListingIds = normalizedAssignedAirbnbListingIds;
    }

    if (password && typeof password === "string") {
      if (password.length < 8) {
        return NextResponse.json(
          { success: false, message: "Password must be at least 8 characters" },
          { status: 400 }
        );
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      updateData.$set.password = hashedPassword;
    }

    const result = await collection.findOneAndUpdate(
      {
        _id: new ObjectId(memberId),
        ownerId: new ObjectId(ownerId),
      },
      updateData,
      { returnDocument: "after" }
    );

    if (!result) {
      logger.warn("Team member not found or unauthorized for PATCH", { memberId, ownerId, ip });
      return NextResponse.json({ success: false, message: "Member not found or unauthorized" }, { status: 404 });
    }

    const updatedMember = toSafeTeamMember(result);

    // Audit log
    await db.collection("auditLogs").insertOne({
      action: "team_member_updated",
      ownerId,
      memberId,
      email: updatedMember.email,
      ip,
      timestamp: new Date().toISOString(),
      status: "success",
      changes: Object.keys(updateData.$set || {}),
    });

    logger.info("Team member updated", {
      memberId,
      ownerId,
      email: updatedMember.email,
    });

    return NextResponse.json({ success: true, member: updatedMember });
  } catch (error) {
    logger.error("PATCH /api/team-members/[id] failed", {
      error: error instanceof Error ? error.message : String(error),
      ip,
    });

    try {
      const { db } = await connectToDatabase();
      await db.collection("auditLogs").insertOne({
        action: "team_member_update_failed",
        ownerId: (await req.json())?.ownerId || "unknown",
        memberId: (await context.params).id,
        ip,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } catch (logErr) {
      logger.error("Failed to write audit log on PATCH failure", { error: logErr });
    }

    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

// ────────────────────────────────────────────────
// POST – Resend team member login SMS (resets password)
// ────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    const rl = customRateLimiter(ip);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    const { id: memberId } = await context.params;
    const { db } = await connectToDatabase();

    const body = await req.json().catch(() => ({} as { action?: string }));
    if (body?.action && body.action !== "resend-login-sms") {
      return NextResponse.json({ success: false, message: "Invalid action" }, { status: 400 });
    }

    const submittedCsrf = req.headers.get("x-csrf-token") || "";
    const storedCsrf = req.cookies.get("csrf-token")?.value || "";
    if (!submittedCsrf || submittedCsrf !== storedCsrf || !validateCsrfToken(req, submittedCsrf)) {
      logger.warn("Invalid CSRF token on team member resend SMS", { ip });
      return buildInvalidCsrfResponse(req);
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    const sessionRole = req.cookies.get("role")?.value || "";

    if (!sessionUserId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<TeamMember>("teamMembers");
    const member = await collection.findOne({ _id: new ObjectId(memberId) });

    if (!member) {
      return NextResponse.json({ success: false, message: "Member not found" }, { status: 404 });
    }

    let effectiveOwnerId = sessionUserId;

    if (sessionRole === "teamMember") {
      const requester = await collection.findOne({
        _id: new ObjectId(sessionUserId),
        active: true,
      });

      if (!requester || !requester.permissions?.includes("users:manage")) {
        logger.warn("Insufficient permissions for team member resend SMS", { sessionUserId, memberId, ip });
        return NextResponse.json(
          { success: false, message: "Insufficient permissions to manage team members" },
          { status: 403 }
        );
      }

      effectiveOwnerId = requester.ownerId.toString();
    }

    if (member.ownerId.toString() !== effectiveOwnerId) {
      logger.warn("Unauthorized resend SMS attempt", { sessionUserId, memberId, ip });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    if (!member.phone) {
      return NextResponse.json({ success: false, message: "Team member has no phone number" }, { status: 400 });
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    await collection.updateOne(
      { _id: new ObjectId(memberId) },
      { $set: { password: hashedPassword, updatedAt: new Date() } }
    );

    const origin = req.headers.get("origin");
    const baseUrl = origin || process.env.APP_URL || "https://app.soranapropertymanagers.com";
    const loginUrl = baseUrl.replace(/\/$/, "");
    const smsMessage =
      `Your team member login has been reset.\n` +
      `Login: ${member.email}\n` +
      `Password: ${tempPassword}\n` +
      `Sign in: ${loginUrl}`;

    await sendWelcomeSms({ phone: member.phone, message: smsMessage });

    await db.collection("auditLogs").insertOne({
      action: "team_member_login_sms_resent",
      ownerId: member.ownerId.toString(),
      memberId,
      email: member.email,
      ip,
      timestamp: new Date().toISOString(),
      status: "success",
    });

    logger.info("Team member login SMS resent", {
      memberId,
      ownerId: member.ownerId.toString(),
      ip,
    });

    return NextResponse.json({ success: true, message: "Login SMS resent" });
  } catch (error) {
    logger.error("POST /api/team-members/[id] resend SMS failed", {
      error: error instanceof Error ? error.message : String(error),
      ip,
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

// ────────────────────────────────────────────────
// DELETE – Remove team member
// ────────────────────────────────────────────────

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  try {
    const rl = customRateLimiter(ip);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, message: "Too many attempts. Try again later." },
        { status: 429 }
      );
    }

    const { id: memberId } = await context.params;
    const { db } = await connectToDatabase();

    const submittedCsrf = req.headers.get("x-csrf-token") || "";
    const storedCsrf = req.cookies.get("csrf-token")?.value || "";
    if (!submittedCsrf || submittedCsrf !== storedCsrf || !validateCsrfToken(req, submittedCsrf)) {
      logger.warn("Invalid CSRF token on team member DELETE", { ip });
      return buildInvalidCsrfResponse(req);
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    const sessionRole = req.cookies.get("role")?.value || "";

    if (!sessionUserId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<TeamMember>("teamMembers");
    let effectiveOwnerId = sessionUserId;

    if (sessionRole === "teamMember") {
      const member = await collection.findOne({
        _id: new ObjectId(sessionUserId),
        active: true,
      });

      if (!member || !member.permissions?.includes("users:manage")) {
        logger.warn("Insufficient permissions for team member DELETE", { sessionUserId, memberId, ip });
        return NextResponse.json(
          { success: false, message: "Insufficient permissions to manage team members" },
          { status: 403 }
        );
      }

      effectiveOwnerId = member.ownerId.toString();
    }

    const result = await collection.deleteOne({
      _id: new ObjectId(memberId),
      ownerId: new ObjectId(effectiveOwnerId),
    });

    if (result.deletedCount === 0) {
      logger.warn("Team member not found or unauthorized for DELETE", { memberId, ownerId: effectiveOwnerId, ip });
      return NextResponse.json({ success: false, message: "Member not found or unauthorized" }, { status: 404 });
    }

    await db.collection("auditLogs").insertOne({
      action: "team_member_deleted",
      ownerId: effectiveOwnerId,
      memberId,
      ip,
      timestamp: new Date().toISOString(),
      status: "success",
    });

    logger.info("Team member deleted", { memberId, ownerId: effectiveOwnerId, ip });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("DELETE /api/team-members/[id] failed", {
      error: error instanceof Error ? error.message : String(error),
      ip,
    });

    try {
      const { db } = await connectToDatabase();
      await db.collection("auditLogs").insertOne({
        action: "team_member_delete_failed",
        ownerId: req.cookies.get("userId")?.value || "unknown",
        memberId: (await context.params).id,
        ip,
        timestamp: new Date().toISOString(),
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    } catch (logErr) {
      logger.error("Failed to write audit log on DELETE failure", { error: logErr });
    }

    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}









