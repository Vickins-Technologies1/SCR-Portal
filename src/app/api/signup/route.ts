import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";

export async function POST(request: Request) {
  try {
    const { name, email, password, phone, confirmPassword } = await request.json();
    if (!name || !email || !password || !phone || !confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Missing required fields" },
        { status: 400 }
      );
    }
    if (password !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Passwords do not match" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const existingUser = await db.collection("users").findOne({ email });
    if (existingUser) {
      return NextResponse.json(
        { success: false, message: "Email already registered" },
        { status: 400 }
      );
    }

    const userCount = await db.collection("users").countDocuments();
    const userId = `user${userCount + 1}`; // Generate unique userId
    const newUser = {
      userId,
      name,
      email,
      password, // TODO: Hash password with bcrypt
      phone,
      role: "propertyOwner",
      createdAt: new Date(),
    };
    await db.collection("users").insertOne(newUser);

    return NextResponse.json(
      { success: true, message: "User registered", userId },
      { status: 201 }
    );
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}