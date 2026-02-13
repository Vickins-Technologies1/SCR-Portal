// src/app/api/signin/route.ts
import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import { v4 as uuidv4 } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    console.log("Received signin request:", body);
    const { email, password, role: providedRole, userId } = body;

    // Validate input
    if (!body || (!email || !password) && !userId) {
      console.log("Invalid or missing fields:", body);
      return NextResponse.json(
        { success: false, message: "Please provide email and password, or a valid user ID" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log("Connected to database");

    // ──────────────────────────────────────────────────────────────
    // Handle userId-based authentication (session validation / auto-login)
    // ──────────────────────────────────────────────────────────────
    if (userId) {
      if (typeof userId !== "string" || !ObjectId.isValid(userId)) {
        console.log("Invalid userId format:", userId);
        return NextResponse.json(
          { success: false, message: "Invalid user ID format" },
          { status: 400 }
        );
      }

      console.log("Validating userId:", userId);
      let user = null;
      let redirectPath = "";
      let finalRole = providedRole || "unknown";
      let isTeamMember = false;
      let isOwner = false;

      // Try tenant
      user = await db.collection("tenants").findOne({ _id: new ObjectId(userId) });
      if (user) {
        finalRole = "tenant";
        redirectPath = "/tenant-dashboard";
      } else {
        // Try property owner
        user = await db.collection("propertyOwners").findOne({ _id: new ObjectId(userId) });
        if (user) {
          finalRole = "propertyOwner";
          redirectPath = "/property-owner-dashboard";
          isOwner = true;
        } else {
          // Try team member
          user = await db.collection("teamMembers").findOne({ _id: new ObjectId(userId) });
          if (user) {
            finalRole = user.role; // e.g. "Manager", "Assistant"
            redirectPath = "/property-owner-dashboard";
            isTeamMember = true;
          }
        }
      }

      if (user) {
        const response = new NextResponse(
          JSON.stringify({
            success: true,
            userId: user._id.toString(),
            role: finalRole,
            redirect: redirectPath,
            isTeamMember,
            isOwner,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

        response.cookies.set("userId", user._id.toString(), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });

        response.cookies.set("role", finalRole, {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });

        response.cookies.set("csrf-token", uuidv4(), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 60 * 60,
          path: "/",
        });

        console.log("Cookies set:", { userId: user._id.toString(), role: finalRole });
        return response;
      }

      console.log("Invalid userId:", userId);
      return NextResponse.json(
        { success: false, message: "Invalid user ID" },
        { status: 401 }
      );
    }

    // ──────────────────────────────────────────────────────────────
    // Email + password login - auto-detect user type
    // ──────────────────────────────────────────────────────────────
    if (!email || !password) {
      console.log("Missing email or password:", { email, password });
      return NextResponse.json(
        { success: false, message: "Email and password are required" },
        { status: 400 }
      );
    }

    console.log("Querying user with email:", email);

    let user = null;
    let redirectPath = "";
    let finalRole = "unknown";
    let isTeamMember = false;
    let isOwner = false;

    // 1. Check propertyOwners (most privileged)
    user = await db.collection("propertyOwners").findOne({
      email: new RegExp(`^${email}$`, "i"),
    });
    if (user) {
      finalRole = "propertyOwner";
      redirectPath = "/property-owner-dashboard";
      isOwner = true;
    } else {
      // 2. Check teamMembers
      user = await db.collection("teamMembers").findOne({
        email: new RegExp(`^${email}$`, "i"),
      });
      if (user) {
        finalRole = user.role; // e.g. "Manager"
        redirectPath = "/property-owner-dashboard";
        isTeamMember = true;
      } else {
        // 3. Check tenants
        user = await db.collection("tenants").findOne({
          email: new RegExp(`^${email}$`, "i"),
        });
        if (user) {
          finalRole = "tenant";
          redirectPath = "/tenant-dashboard";
        }
      }
    }

    if (user) {
      // Password verification
      let isPasswordValid = false;

      // Use bcrypt.compare for hashed passwords (teamMembers + modern owners/tenants)
      try {
        isPasswordValid = await bcrypt.compare(password, user.password);
      } catch (bcryptErr) {
        console.log("bcrypt.compare failed - falling back to plain comparison for legacy owners");
        // Fallback for existing propertyOwners with plain-text passwords
        if (finalRole === "propertyOwner") {
          isPasswordValid = password === user.password;
        }
      }

      if (isPasswordValid) {
        const response = new NextResponse(
          JSON.stringify({
            success: true,
            userId: user._id.toString(),
            role: finalRole,
            redirect: redirectPath,
            isTeamMember,
            isOwner,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

        response.cookies.set("userId", user._id.toString(), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });

        response.cookies.set("role", finalRole, {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });

        response.cookies.set("csrf-token", uuidv4(), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 60 * 60,
          path: "/",
        });

        console.log("Cookies set:", { userId: user._id.toString(), role: finalRole });
        return response;
      }

      console.log("Invalid password for email:", email);
      return NextResponse.json(
        { success: false, message: "Invalid email or password" },
        { status: 401 }
      );
    }

    console.log("No user found for email:", email);
    return NextResponse.json(
      { success: false, message: "User not found" },
      { status: 401 }
    );
  } catch (error) {
    console.error("Signin error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      requestBody: await request.json().catch(() => "Failed to parse request body"),
    });

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}