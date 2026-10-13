import { NextResponse, type NextRequest } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { adminPermissionsCover, normalizeAdminPermissions, type AdminPermission } from "@/lib/admin-permissions";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/session";

export type AdminRole = "admin" | "adminTeamMember";

export type AdminAuthContext = {
  userId: string;
  role: AdminRole;
  permissions: AdminPermission[];
  teamRole?: string | null;
};

const jsonUnauthorized = () =>
  NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });

const jsonForbidden = () =>
  NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });

function normalizeRequired(required?: AdminPermission | AdminPermission[]) {
  if (!required) return [];
  return Array.isArray(required) ? required : [required];
}

export async function requireAdmin(
  request: NextRequest,
  required?: AdminPermission | AdminPermission[]
): Promise<AdminAuthContext | NextResponse> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;
  const role = session?.role;
  const userId = session?.sub;

  if (!role || !userId) return jsonUnauthorized();

  if (role === "admin") {
    if (!ObjectId.isValid(userId)) return jsonUnauthorized();
    const { db } = await connectToDatabase();
    const admin = await db.collection("propertyOwners").findOne({
      _id: new ObjectId(userId),
      role: "admin",
      accountStatus: { $ne: "suspended" },
    }, { projection: { _id: 1 } });
    if (!admin) return jsonUnauthorized();
    return { userId, role: "admin", permissions: [] };
  }

  if (role !== "adminTeamMember") return jsonUnauthorized();
  if (!ObjectId.isValid(userId)) return jsonUnauthorized();

  const requiredList = normalizeRequired(required);
  const { db } = await connectToDatabase();
  const member = await db.collection("adminTeamMembers").findOne({
    _id: new ObjectId(userId),
    role: "adminTeamMember",
    active: true,
  });

  if (!member) return jsonUnauthorized();

  const permissions = normalizeAdminPermissions(member.permissions);
  if (requiredList.length > 0) {
    for (const perm of requiredList) {
      if (!adminPermissionsCover(perm, permissions)) return jsonForbidden();
    }
  }

  return {
    userId,
    role: "adminTeamMember",
    permissions,
    teamRole: typeof member.teamRole === "string" ? member.teamRole : null,
  };
}
