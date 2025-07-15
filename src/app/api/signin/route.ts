import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Received signin request:", body);
    const { email, password, role, userId } = body;

    if (!body || (typeof email !== "string" || typeof password !== "string" || typeof role !== "string") && !userId) {
      console.log("Invalid or missing fields:", body);
      return NextResponse.json(
        { success: false, message: "Invalid or missing required fields" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log("Connected to database");

    if (userId) {
      console.log("Validating userId:", userId);
      const user = await db.collection("users").findOne({ _id: userId });
      if (user && user.role === role) {
        const redirectPath = role === "tenant" ? "/tenant-dashboard" : "/property-owner-dashboard";
        const response = new NextResponse(
          JSON.stringify({ success: true, userId: user._id.toString(), role, redirect: redirectPath }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

        response.cookies.set("userId", user._id.toString(), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });

        response.cookies.set("role", role, {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });

        console.log("Cookies set:", { userId: user._id.toString(), role });
        return response;
      }

      console.log("Invalid userId or role:", { userId, role });
      return NextResponse.json(
        { success: false, message: "Invalid user ID or role" },
        { status: 401 }
      );
    }

    if (!email || !password || !role) {
      console.log("Missing fields:", { email, password, role });
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }

    console.log("Querying user with email:", email);
    const user = await db.collection("users").findOne({ email, password });

    if (user) {
      if (user.role === role) {
        const redirectPath = role === "tenant" ? "/tenant-dashboard" : "/property-owner-dashboard";
        const response = new NextResponse(
          JSON.stringify({ success: true, userId: user._id.toString(), role, redirect: redirectPath }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

        response.cookies.set("userId", user._id.toString(), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });

        response.cookies.set("role", role, {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });

        console.log("Cookies set:", { userId: user._id.toString(), role });
        return response;
      }

      console.log("Role mismatch:", { userRole: user.role, requestedRole: role });
      return NextResponse.json(
        { success: false, message: "Invalid role" },
        { status: 403 }
      );
    }

    console.log("No user found for email:", email);
    return NextResponse.json(
      { success: false, message: "Invalid credentials" },
      { status: 401 }
    );
  } catch (error) {
    console.error("Signin error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: await request.json().catch(() => "Failed to parse request body"),
    });

    if (error instanceof Error && error.message.includes("Database configuration error")) {
      return NextResponse.json(
        { success: false, message: "Database configuration error: Please check environment variables" },
        { status: 500 }
      );
    }

    if (error instanceof Error && error.message.includes("Failed to connect to the database")) {
      return NextResponse.json(
        { success: false, message: "Unable to connect to the database. Please try again later." },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
