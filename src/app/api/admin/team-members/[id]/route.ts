import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import bcrypt from "bcrypt";
import sanitizeHtml from "sanitize-html";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminRolePreset, normalizeAdminPermissions } from "@/lib/admin-permissions";

type PatchBody = {
  name?: string;
  phone?: string;
  teamRole?: string;
  permissions?: string[];
  active?: boolean;
  password?: string;
};

function assertCsrf(req: NextRequest) {
  const submittedCsrf = req.headers.get("x-csrf-token") || "";
  const storedCsrf = req.cookies.get("csrf-token")?.value || "";
  if (!submittedCsrf || submittedCsrf !== storedCsrf || !validateCsrfToken(req, submittedCsrf)) {
    return buildInvalidCsrfResponse(req);
  }
  return null;
}

function normalizeString(value: unknown) {
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request, "admin:team-members:manage");
  if (auth instanceof NextResponse) return auth;

  const csrfError = assertCsrf(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid team member id" }, { status: 400 });
  }

  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const update: Record<string, any> = { updatedAt: new Date() };

  const nextName = normalizeString(body.name);
  if (nextName) update.name = nextName;

  const nextPhone = normalizeString(body.phone);
  if (typeof body.phone === "string") update.phone = nextPhone || "";

  const nextTeamRole = normalizeString(body.teamRole);
  if (nextTeamRole) update.teamRole = nextTeamRole;

  if (Array.isArray(body.permissions)) {
    const normalized = normalizeAdminPermissions(body.permissions);
    update.permissions = normalized;
  } else if (nextTeamRole) {
    update.permissions = getAdminRolePreset(nextTeamRole);
  }

  if (typeof body.active === "boolean") {
    update.active = body.active;
  }

  if (typeof body.password === "string" && body.password.length > 0) {
    const passwordErr = validatePassword(body.password);
    if (passwordErr) {
      return NextResponse.json({ success: false, message: passwordErr }, { status: 400 });
    }
    update.password = await bcrypt.hash(body.password, 12);
  }

  try {
    const { db } = await connectToDatabase();
    const result = await db
      .collection("adminTeamMembers")
      .findOneAndUpdate(
        { _id: new ObjectId(id), role: "adminTeamMember" },
        { $set: update },
        { returnDocument: "after" }
      );

    const updated = result?.value;
    if (!updated) {
      return NextResponse.json({ success: false, message: "Team member not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        teamMember: {
          _id: updated._id.toString(),
          role: updated.role,
          teamRole: updated.teamRole || "Custom",
          name: updated.name || "",
          email: updated.email || "",
          phone: updated.phone || "",
          permissions: Array.isArray(updated.permissions) ? updated.permissions : [],
          active: Boolean(updated.active),
          createdAt: updated.createdAt ? new Date(updated.createdAt).toISOString() : null,
          updatedAt: updated.updatedAt ? new Date(updated.updatedAt).toISOString() : null,
          lastLoginAt: updated.lastLoginAt ? new Date(updated.lastLoginAt).toISOString() : null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin team member update error:", error);
    return NextResponse.json({ success: false, message: "Failed to update team member" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request, "admin:team-members:manage");
  if (auth instanceof NextResponse) return auth;

  const csrfError = assertCsrf(request);
  if (csrfError) return csrfError;

  const { id } = await params;
  if (!id || !ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid team member id" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const result = await db.collection("adminTeamMembers").deleteOne({
      _id: new ObjectId(id),
      role: "adminTeamMember",
    });

    if (!result.deletedCount) {
      return NextResponse.json({ success: false, message: "Team member not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Admin team member delete error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete team member" }, { status: 500 });
  }
}

