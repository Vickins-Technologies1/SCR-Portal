import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";

export async function POST(request: NextRequest) {
  const adminOriginalUserId = request.cookies.get("adminOriginalUserId")?.value;
  const adminOriginalRole = request.cookies.get("adminOriginalRole")?.value;

  if (!adminOriginalUserId || !ObjectId.isValid(adminOriginalUserId) || adminOriginalRole !== "admin") {
    return NextResponse.json({ success: false, message: "No admin impersonation session" }, { status: 400 });
  }

  const response = NextResponse.json({
    success: true,
    redirect: "/admin/users",
  });

  response.cookies.set("userId", adminOriginalUserId, {
    path: "/",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 3600,
  });

  response.cookies.set("role", "admin", {
    path: "/",
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 3600,
  });

  response.cookies.delete("adminOriginalUserId");
  response.cookies.delete("adminOriginalRole");
  response.cookies.delete("adminImpersonating");
  response.cookies.delete("adminImpersonatingOwnerId");
  response.cookies.delete("adminImpersonatingOwnerName");

  return response;
}
