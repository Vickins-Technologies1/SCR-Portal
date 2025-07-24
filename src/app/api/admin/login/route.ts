import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db } from "mongodb";

export async function POST(request: Request) {
  let email: string | null = null;
  try {
    const { email: requestEmail, password, role } = await request.json();
    email = requestEmail;

    // Log incoming request data
    console.log("Login request:", { email, password, role });

    // Validate input
    if (!email || !password || role !== "admin") {
      console.log("Invalid credentials:", { email, role });
      return NextResponse.json({ success: false, message: "Invalid credentials" }, { status: 400 });
    }

    // Connect to database
    const { db }: { db: Db } = await connectToDatabase();

    // Log all collections in the database
    const collections = await db.listCollections().toArray();
    console.log("Database collections in rentaldb:", collections.map(c => c.name));

    // Check if email exists in propertyOwners collection
    const userByEmail = await db.collection("propertyOwners").findOne({ email: email.trim().toLowerCase() });
    console.log("User by email:", userByEmail ? {
      _id: userByEmail._id.toString(),
      email: userByEmail.email,
      role: userByEmail.role,
      createdAt: userByEmail.createdAt ? (userByEmail.createdAt instanceof Date ? userByEmail.createdAt.toISOString() : String(userByEmail.createdAt)) : "Not set"
    } : "No user found with email: " + email.trim().toLowerCase());

    // Log all admin users for debugging
    const adminUsers = await db.collection("propertyOwners").find({ role: "admin" }).toArray();
    console.log("All admins in propertyOwners:", adminUsers.map(u => ({
      _id: u._id.toString(),
      email: u.email,
      role: u.role,
      createdAt: u.createdAt ? (u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt)) : "Not set"
    })));

    // Query the propertyOwners collection for an admin user
    const user = await db.collection("propertyOwners").findOne({
      email: email.trim().toLowerCase(),
      role: "admin"
    });

    if (!user) {
      console.log("User not found for:", { email: email.trim().toLowerCase(), role: "admin" });
      return NextResponse.json({ success: false, message: "Admin user not found" }, { status: 404 });
    }

    // Compare plain-text password
    if (password !== user.password) {
      console.log("Password mismatch for:", { email: email.trim().toLowerCase() });
      return NextResponse.json({ success: false, message: "Invalid password" }, { status: 401 });
    }

    // Log successful user lookup
    console.log("User found:", { userId: user._id.toString(), role: user.role });

    // Prepare response and set cookies
    const response = NextResponse.json({
      success: true,
      user: { _id: user._id.toString(), role: user.role }
    });

    // Set cookies in the response
    const cookieOptions = {
      httpOnly: false, // Allow client-side access for debugging
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict" as const,
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/"
    };

    response.cookies.set("userId", user._id.toString(), cookieOptions);
    response.cookies.set("role", user.role, cookieOptions);
    console.log("Cookies set in response:", { userId: user._id.toString(), role: user.role, options: cookieOptions });

    return response;
  } catch (error: unknown) {
    console.error("Login error:", {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      email: email ? email.trim().toLowerCase() : "Not provided"
    });
    return NextResponse.json({ success: false, message: "Server error. Please try again later." }, { status: 500 });
  }
}