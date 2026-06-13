// src/app/api/admin/users/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db } from "mongodb";
import { requireAdmin } from "../../../../lib/admin-auth";

const clampPageSize = (value: string | null, fallback = 50, max = 200) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
};

const parsePage = (value: string | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.floor(parsed);
};

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:owners:view");
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(request.url);
    const page = parsePage(searchParams.get("page"));
    const limit = clampPageSize(searchParams.get("limit"));
    const skip = (page - 1) * limit;
    const { db }: { db: Db } = await connectToDatabase();
    const [users, count] = await Promise.all([
      db
        .collection("propertyOwners")
        .find()
        .project({ _id: 1, name: 1, email: 1, role: 1 })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .toArray(),
      db.collection("propertyOwners").countDocuments(),
    ]);

    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        ...u,
        _id: u._id.toString(),
      })),
      count,
      pagination: { page, limit, total: count, hasMore: skip + users.length < count },
    });
  } catch (error: unknown) {
    console.error("Users fetch error:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ success: false, message: "Failed to fetch users" }, { status: 500 });
  }
}
