import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import validator from "validator";
import sanitizeHtml from "sanitize-html";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminRolePreset, normalizeAdminPermissions } from "@/lib/admin-permissions";

type AdminTeamMemberDoc = {
  _id: ObjectId;
  role: "adminTeamMember";
  teamRole: string;
  name: string;
  email: string;
  phone?: string;
  permissions: string[];
  password: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
};

type CreateBody = {
  name: string;
  email: string;
  phone?: string;
  teamRole: string;
  permissions?: string[];
  password: string;
};

function normalizeEmail(value: unknown) {
  if (typeof value !== "string") return "";
  return sanitizeHtml(value.trim().toLowerCase(), { allowedTags: [] });
}

function normalizeName(value: unknown) {
  if (typeof value !== "string") return "";
  return sanitizeHtml(value.trim(), { allowedTags: [] });
}

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return undefined;
  const cleaned = sanitizeHtml(value.trim(), { allowedTags: [] });
  return cleaned || undefined;
}

function validatePassword(password: string) {
  if (password.length < 8) return "Password must be at least 8 characters.";
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  if (!passwordRegex.test(password)) {
    return "Password must contain uppercase, lowercase, number, and special character.";
  }
  return null;
}

function assertCsrf(req: NextRequest) {
  const submittedCsrf = req.headers.get("x-csrf-token") || "";
  const storedCsrf = req.cookies.get("csrf-token")?.value || "";
  if (!submittedCsrf || submittedCsrf !== storedCsrf || !validateCsrfToken(req, submittedCsrf)) {
    return buildInvalidCsrfResponse(req);
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:team-members:view");
  if (auth instanceof NextResponse) return auth;

  try {
    const { db } = await connectToDatabase();

    const admins = await db
      .collection("propertyOwners")
      .find({ role: "admin" })
      .project({ _id: 1, name: 1, email: 1, phone: 1, lastLoginAt: 1, createdAt: 1 })
      .toArray();

    const teamMembers = await db
      .collection<AdminTeamMemberDoc>("adminTeamMembers")
      .find({ role: "adminTeamMember" })
      .sort({ createdAt: -1 })
      .project({
        _id: 1,
        role: 1,
        teamRole: 1,
        name: 1,
        email: 1,
        phone: 1,
        permissions: 1,
        active: 1,
        createdAt: 1,
        updatedAt: 1,
        lastLoginAt: 1,
      })
      .toArray();

    return NextResponse.json(
      {
        success: true,
        admins: admins.map((a) => ({
          _id: a._id?.toString?.() ?? "",
          name: a.name || "Admin",
          email: a.email || "",
          phone: a.phone || "",
          role: "admin",
          active: true,
          createdAt: a.createdAt ? new Date(a.createdAt).toISOString() : null,
          lastLoginAt: a.lastLoginAt ? new Date(a.lastLoginAt).toISOString() : null,
        })),
        teamMembers: teamMembers.map((m) => ({
          _id: m._id.toString(),
          role: m.role,
          teamRole: m.teamRole,
          name: m.name,
          email: m.email,
          phone: m.phone || "",
          permissions: Array.isArray(m.permissions) ? m.permissions : [],
          active: Boolean(m.active),
          createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : null,
          updatedAt: m.updatedAt ? new Date(m.updatedAt).toISOString() : null,
          lastLoginAt: m.lastLoginAt ? new Date(m.lastLoginAt).toISOString() : null,
        })),
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin team members fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch team members" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:team-members:manage");
  if (auth instanceof NextResponse) return auth;

  const csrfError = assertCsrf(request);
  if (csrfError) return csrfError;

  let payload: CreateBody;
  try {
    payload = (await request.json()) as CreateBody;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const name = normalizeName(payload?.name);
  const email = normalizeEmail(payload?.email);
  const phone = normalizePhone(payload?.phone);
  const teamRoleRaw = typeof payload?.teamRole === "string" ? payload.teamRole.trim() : "";
  const password = typeof payload?.password === "string" ? payload.password : "";

  if (!name || !email || !teamRoleRaw || !password) {
    return NextResponse.json({ success: false, message: "Missing required fields" }, { status: 400 });
  }

  if (!validator.isEmail(email)) {
    return NextResponse.json({ success: false, message: "Invalid email format" }, { status: 400 });
  }

  const passwordErr = validatePassword(password);
  if (passwordErr) {
    return NextResponse.json({ success: false, message: passwordErr }, { status: 400 });
  }

  const presetPermissions = getAdminRolePreset(teamRoleRaw);
  const requestedPermissions = normalizeAdminPermissions(payload?.permissions);
  const permissions = requestedPermissions.length > 0 ? requestedPermissions : presetPermissions;

  try {
    const { db } = await connectToDatabase();

    const emailInAdmins = await db.collection("propertyOwners").findOne({
      email,
      role: "admin",
    });
    if (emailInAdmins) {
      return NextResponse.json(
        { success: false, message: "That email already belongs to an admin account." },
        { status: 409 }
      );
    }

    const existing = await db.collection("adminTeamMembers").findOne({ email, role: "adminTeamMember" });
    if (existing) {
      return NextResponse.json(
        { success: false, message: "A team member with this email already exists." },
        { status: 409 }
      );
    }

    const now = new Date();
    const hashedPassword = await bcrypt.hash(password, 12);

    const doc: Omit<AdminTeamMemberDoc, "_id"> = {
      role: "adminTeamMember",
      teamRole: teamRoleRaw,
      name,
      email,
      phone,
      permissions,
      password: hashedPassword,
      active: true,
      createdAt: now,
      updatedAt: now,
    };

    const result = await db.collection("adminTeamMembers").insertOne(doc);

    return NextResponse.json(
      {
        success: true,
        teamMember: {
          _id: result.insertedId.toString(),
          role: doc.role,
          teamRole: doc.teamRole,
          name: doc.name,
          email: doc.email,
          phone: doc.phone || "",
          permissions: doc.permissions,
          active: doc.active,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          lastLoginAt: null,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Admin team member create error:", error);
    return NextResponse.json({ success: false, message: "Failed to create team member" }, { status: 500 });
  }
}

