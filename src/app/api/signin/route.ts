import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Received signin request:", body);
    const { email, password, role, userId } = body;

    // Validate input
    if (!body || (typeof email !== "string" || typeof password !== "string" || typeof role !== "string") && !userId) {
      console.log("Invalid or missing fields:", body);
      return NextResponse.json(
        { success: false, message: "Please provide email, password, and role, or a valid user ID" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log("Connected to database");

    // Log all collections in the database
    const collections = await db.listCollections().toArray();
    console.log("Database collections in rentaldb:", collections.map(c => c.name));

    // Handle userId-based authentication (for session validation)
    if (userId) {
      if (typeof userId !== "string") {
        console.log("Invalid userId type:", userId);
        return NextResponse.json(
          { success: false, message: "Invalid user ID format" },
          { status: 400 }
        );
      }

      if (!ObjectId.isValid(userId)) {
        console.log("Invalid ObjectId:", userId);
        return NextResponse.json(
          { success: false, message: "Invalid user ID format" },
          { status: 400 }
        );
      }

      console.log("Validating userId:", userId);
      let user = null;
      let redirectPath = "";
      if (role === "tenant") {
        user = await db.collection("tenants").findOne({ _id: new ObjectId(userId), role: "tenant" });
        redirectPath = "/tenant-dashboard";
      } else if (role === "propertyOwner") {
        user = await db.collection("propertyOwners").findOne({ _id: new ObjectId(userId), role: "propertyOwner" });
        redirectPath = "/property-owner-dashboard";
      } else {
        console.log("Invalid role:", role);
        return NextResponse.json(
          { success: false, message: "Role must be 'tenant' or 'propertyOwner'" },
          { status: 400 }
        );
      }

      if (user) {
        const response = new NextResponse(
          JSON.stringify({ success: true, userId: user._id.toString(), role, redirect: redirectPath }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

        response.cookies.set("userId", user._id.toString(), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60, // 7 days
          path: "/",
        });

        response.cookies.set("role", role, {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60, // 7 days
          path: "/",
        });

        console.log("Cookies set:", { userId: user._id.toString(), role });
        return response;
      }

      console.log("Invalid userId or role:", { userId, role });
      return NextResponse.json(
        { success: false, message: `Invalid ${role === "tenant" ? "tenant" : "property owner"} ID` },
        { status: 401 }
      );
    }

    // Handle email/password authentication
    if (!email || !password || !role) {
      console.log("Missing fields:", { email, password, role });
      return NextResponse.json(
        { success: false, message: "Email, password, and role are required" },
        { status: 400 }
      );
    }

    if (role !== "tenant" && role !== "propertyOwner") {
      console.log("Invalid role requested:", role);
      return NextResponse.json(
        { success: false, message: "Role must be 'tenant' or 'propertyOwner'" },
        { status: 400 }
      );
    }

    console.log("Querying user with email:", email);
    let user = null;
    let redirectPath = "";
    if (role === "tenant") {
      user = await db.collection("tenants").findOne({ email: new RegExp(`^${email}$`, "i"), role: "tenant" });
      redirectPath = "/tenant-dashboard";
    } else if (role === "propertyOwner") {
      user = await db.collection("propertyOwners").findOne({ email: new RegExp(`^${email}$`, "i"), role: "propertyOwner" });
      redirectPath = "/property-owner-dashboard";
    }

    if (user) {
      // Verify password
      let isPasswordValid = false;
      if (role === "tenant") {
        isPasswordValid = await bcrypt.compare(password, user.password);
      } else if (role === "propertyOwner") {
        isPasswordValid = password === user.password;
      }

      if (isPasswordValid) {
        const response = new NextResponse(
          JSON.stringify({ success: true, userId: user._id.toString(), role, redirect: redirectPath }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );

        response.cookies.set("userId", user._id.toString(), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60, // 7 days
          path: "/",
        });

        response.cookies.set("role", role, {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60, // 7 days
          path: "/",
        });

        console.log("Cookies set:", { userId: user._id.toString(), role });
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