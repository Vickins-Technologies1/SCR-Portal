import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("Received signup request:", body);
    const { name, email, password, phone, confirmPassword, role } = body;

    // Validate input
    if (!name || !email || !password || !phone || !confirmPassword || !role) {
      console.log("Missing fields:", body);
      return NextResponse.json(
        { success: false, message: "All fields are required" },
        { status: 400 }
      );
    }

    if (role !== "propertyOwner") {
      console.log("Invalid role:", role);
      return NextResponse.json(
        { success: false, message: "Role must be 'propertyOwner'" },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      console.log("Passwords do not match");
      return NextResponse.json(
        { success: false, message: "Passwords do not match" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    console.log("Connected to database");

    // Check if email already exists (case-insensitive)
    const existingUser = await db.collection("propertyOwners").findOne({
      email: new RegExp(`^${email}$`, "i"),
    });
    if (existingUser) {
      console.log("Email already exists:", email);
      return NextResponse.json(
        { success: false, message: "Email already registered" },
        { status: 400 }
      );
    }

    // Create new user with unhashed password
    const newUser = {
      name,
      email: email.toLowerCase(),
      password, // Store unhashed
      phone,
      role: "propertyOwner",
      createdAt: new Date().toISOString(),
    };

    // Insert new property owner
    const result = await db.collection("propertyOwners").insertOne(newUser);

    console.log("Property owner created:", { userId: result.insertedId.toString(), email });
    return NextResponse.json(
      { success: true, userId: result.insertedId.toString(), message: "Account created successfully" },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", {
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