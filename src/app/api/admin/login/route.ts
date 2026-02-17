// app/api/admin/login/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db } from "mongodb";
import bcrypt from "bcrypt";

export async function POST(request: Request) {
  let email: string | null = null;

  try {
    const body = await request.json();
    email = body.email?.trim().toLowerCase();
    const { password, role } = body;

    if (!email || !password || role !== "admin") {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 400 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();

    const user = await db.collection("propertyOwners").findOne({
      email,
      role: "admin",
    });

    if (!user) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return NextResponse.json(
        { success: false, message: "Invalid credentials" },
        { status: 401 }
      );
    }

    // ── Success ────────────────────────────────────────────────
    const response = NextResponse.json({
      success: true,
      user: {
        id: user._id.toString(),
        role: user.role,
      },
    });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax" as const,          // better UX than 'strict'
      maxAge: 7 * 24 * 60 * 60,          // 7 days
      path: "/",
    };

    response.cookies.set("userId", user._id.toString(), cookieOptions);
    response.cookies.set("role", user.role, cookieOptions);

    return response;
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json(
      { success: false, message: "Server error" },
      { status: 500 }
    );
  }
}