// src/app/api/team-members/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import validator from "validator";
import sanitizeHtml from "sanitize-html";
import { validateCsrfToken } from "@/lib/csrf";

// ────────────────────────────────────────────────
// Type Definitions
// ────────────────────────────────────────────────

interface TeamMember {
  _id?: string | ObjectId;
  ownerId: string | ObjectId;
  name: string;
  email: string;
  phone?: string;
  role: "Co-Owner" | "Manager" | "Accountant" | "Assistant" | "Viewer";
  permissions: string[];
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
    role: rest.role ?? "Viewer",
    permissions: rest.permissions ?? [],
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
    const { ownerId, name, email, phone, role, permissions, active, password } = body;

    if (!ownerId) {
      return NextResponse.json({ success: false, message: "ownerId required" }, { status: 400 });
    }

    const submittedCsrf = req.headers.get("x-csrf-token") || "";
    const storedCsrf = req.cookies.get("csrf-token")?.value || "";
    if (!submittedCsrf || submittedCsrf !== storedCsrf || !validateCsrfToken(req, submittedCsrf)) {
      logger.warn("Invalid CSRF token on team member PATCH", { ip });
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    if (!sessionUserId || sessionUserId !== ownerId) {
      logger.warn("Unauthorized PATCH attempt on team member", { sessionUserId, memberId, ip });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<TeamMember>("teamMembers");

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
    if (role !== undefined) updateData.$set.role = role;
    if (permissions !== undefined && Array.isArray(permissions)) updateData.$set.permissions = permissions;
    if (active !== undefined) updateData.$set.active = !!active;

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
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    const ownerId = req.cookies.get("userId")?.value;
    if (!ownerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<TeamMember>("teamMembers");

    const result = await collection.deleteOne({
      _id: new ObjectId(memberId),
      ownerId: new ObjectId(ownerId),
    });

    if (result.deletedCount === 0) {
      logger.warn("Team member not found or unauthorized for DELETE", { memberId, ownerId, ip });
      return NextResponse.json({ success: false, message: "Member not found or unauthorized" }, { status: 404 });
    }

    await db.collection("auditLogs").insertOne({
      action: "team_member_deleted",
      ownerId,
      memberId,
      ip,
      timestamp: new Date().toISOString(),
      status: "success",
    });

    logger.info("Team member deleted", { memberId, ownerId, ip });

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