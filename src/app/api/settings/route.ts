import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import bcrypt from "bcryptjs";
import { ObjectId } from "mongodb";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get("ownerId");

    if (!ownerId) {
      console.log("[PUT] Missing ownerId in query params");
      return NextResponse.json(
        { success: false, message: "Owner ID is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    
    const owner = await db.collection("propertyOwners").findOne(
      { _id: new ObjectId(ownerId) },
      { projection: { name: 1, email: 1, phone: 1 } }
    );

    if (!owner) {
      console.log("[GET] Owner not found for ownerId:", ownerId);
      return NextResponse.json(
        { success: false, message: "Owner not found" },
        { status: 404 }
      );
    }

    const paymentSettings = await db.collection("paymentSettings").findOne(
      { ownerId: new ObjectId(ownerId) }
    );

    return NextResponse.json({
      success: true,
      owner,
      paymentSettings: paymentSettings || {
        umsPayEnabled: false,
        umsPayApiKey: "",
        umsPayEmail: owner.email,
        umsPayAccountId: "",
        umsCommsEnabled: false,
        umsCommsApiKey: "",
        umsCommsAppId: "",
        umsCommsSenderId: "",
        stripeEnabled: false,
        stripeApiKey: "",
        paypalEnabled: false,
        paypalClientId: "",
        bankTransferEnabled: false,
        bankAccountDetails: "",
      },
    });
  } catch (error: unknown) { // Changed from any to unknown
    console.error("[GET] Settings error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  let body = null;

  try {
    body = await request.json();
    console.log("[PUT] Received payload:", body);

    const { ownerId, name, email, phone } = body;

    if (!ownerId || !name || !email || !phone) {
      console.log("[PUT] Validation failed:", { ownerId, name, email, phone });
      return NextResponse.json(
        { success: false, message: "All fields are required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const existingUser = await db.collection("propertyOwners").findOne({
      email: new RegExp(`^${email}$`, "i"),
      _id: { $ne: new ObjectId(ownerId) },
    });

    if (existingUser) {
      console.log("[PUT] Email already in use:", email);
      return NextResponse.json(
        { success: false, message: "Email already in use" },
        { status: 400 }
      );
    }

    const result = await db.collection("propertyOwners").updateOne(
      { _id: new ObjectId(ownerId) },
      { $set: { name, email: email.toLowerCase(), phone, updatedAt: new Date().toISOString() } }
    );

    if (result.modifiedCount === 0) {
      console.log("[PUT] No changes made or owner not found for ownerId:", ownerId);
      return NextResponse.json(
        { success: false, message: "Failed to update profile or no changes made" },
        { status: 400 }
      );
    }

    console.log("[PUT] Profile updated successfully for ownerId:", ownerId);
    return NextResponse.json({
      success: true,
      message: "Profile updated successfully",
    });
  } catch (error) {
    console.error("[PUT] Profile error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      body,
    });

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("[POST] Received payment settings payload:", body);
    const {
      ownerId,
      umsPayEnabled,
      umsPayApiKey,
      umsPayEmail,
      umsPayAccountId,
      umsCommsEnabled,
      umsCommsApiKey,
      umsCommsAppId,
      umsCommsSenderId,
      stripeEnabled,
      stripeApiKey,
      paypalEnabled,
      paypalClientId,
      bankTransferEnabled,
      bankAccountDetails,
    } = body;

    if (!ownerId) {
      console.log("[POST] Missing ownerId");
      return NextResponse.json(
        { success: false, message: "Owner ID is required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const paymentSettings = {
      ownerId: new ObjectId(ownerId),
      umsPayEnabled: !!umsPayEnabled,
      umsPayApiKey: umsPayApiKey || "",
      umsPayEmail: umsPayEmail || "",
      umsPayAccountId: umsPayAccountId || "",
      umsCommsEnabled: !!umsCommsEnabled,
      umsCommsApiKey: umsCommsApiKey || "",
      umsCommsAppId: umsCommsAppId || "",
      umsCommsSenderId: umsCommsSenderId || "",
      stripeEnabled: !!stripeEnabled,
      stripeApiKey: stripeApiKey || "",
      paypalEnabled: !!paypalEnabled,
      paypalClientId: paypalClientId || "",
      bankTransferEnabled: !!bankTransferEnabled,
      bankAccountDetails: bankAccountDetails || "",
      updatedAt: new Date().toISOString(),
    };

    await db.collection("paymentSettings").updateOne(
      { ownerId: new ObjectId(ownerId) },
      { $set: paymentSettings },
      { upsert: true }
    );

    console.log("[POST] Payment settings updated for ownerId:", ownerId);
    return NextResponse.json({
      success: true,
      message: "Payment settings updated successfully",
    });
  } catch (error) {
    console.error("[POST] Payment settings error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    console.log("[PATCH] Received password change payload:", body);
    const { ownerId, password } = body;

    if (!ownerId || !password) {
      console.log("[PATCH] Validation failed:", { ownerId, password });
      return NextResponse.json(
        { success: false, message: "Owner ID and password are required" },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();

    const hashedPassword = await bcrypt.hash(password, 10);

    await db.collection("propertyOwners").updateOne( // Removed unused result variable
      { _id: new ObjectId(ownerId) },
      { $set: { password: hashedPassword, updatedAt: new Date().toISOString() } }
    );

    console.log("[PATCH] Password updated successfully for ownerId:", ownerId);
    return NextResponse.json({
      success: true,
      message: "Password updated successfully",
    });
  } catch (error) {
    console.error("[PATCH] Password error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}