// src/app/api/signin/route.ts
import { NextResponse, NextRequest } from "next/server";
import { connectToDatabase } from "../../../lib/mongodb";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import { v4 as uuidv4 } from "uuid";
import { getDefaultPermissions } from "../../../lib/permissions";
import { deliverOtp } from "../../../lib/otp-delivery";
import {
  generateOtpCode,
  hashOtpCode,
  OTP_EXPIRY_MS,
  OTP_MAX_ATTEMPTS,
  OTP_REQUIRE_AFTER_MS,
} from "../../../lib/otp";

const OTP_COLLECTION = "otpChallenges";

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
      let userCollection: "tenants" | "propertyOwners" | "teamMembers" | null = null;

      // Try tenant
      user = await db.collection("tenants").findOne({ _id: new ObjectId(userId) });
      if (user) {
        finalRole = "tenant";
        redirectPath = "/tenant-dashboard";
        userCollection = "tenants";
      } else {
        // Try property owner
        user = await db.collection("propertyOwners").findOne({ _id: new ObjectId(userId) });
        if (user) {
          finalRole = "propertyOwner";
          redirectPath = "/property-owner-dashboard";
          isOwner = true;
          userCollection = "propertyOwners";

          // ──── ADMIN APPROVAL CHECK ────
          if (user.isApproved === false) {
            return NextResponse.json(
              {
                success: false,
                message: "Your account is still pending admin approval. Please try again later or contact support.",
              },
              { status: 403 }
            );
          }
          // ─────────────────────────────────
        } else {
          // Try team member
          user = await db.collection("teamMembers").findOne({ _id: new ObjectId(userId) });
          if (user) {
            finalRole = user.role; // e.g. "Manager", "Assistant"
            redirectPath = "/property-owner-dashboard";
            isTeamMember = true;
            userCollection = "teamMembers";
          }
        }
      }

      if (user) {
        if (!userCollection) {
          return NextResponse.json(
            { success: false, message: "Unable to resolve user collection" },
            { status: 500 }
          );
        }

        const now = new Date();
        const lastLoginAt = user.lastLoginAt ? new Date(user.lastLoginAt) : null;
        const requiresOtp =
          finalRole !== "propertyOwner" &&
          finalRole !== "tenant" &&
          (!lastLoginAt || Number.isNaN(lastLoginAt.getTime())
            ? true
            : now.getTime() - lastLoginAt.getTime() > OTP_REQUIRE_AFTER_MS);

        if (requiresOtp) {
          const otpEmail = user.email?.toString();
          const otpPhone = user.phone?.toString();

          if (!otpEmail || !otpPhone) {
            return NextResponse.json(
              { success: false, message: "Email and phone number are required for OTP login." },
              { status: 400 }
            );
          }

          const otpCode = generateOtpCode();
          const otpRecordId = new ObjectId();

          await db.collection(OTP_COLLECTION).deleteMany({
            userId: user._id.toString(),
            purpose: "login",
          });

          await db.collection(OTP_COLLECTION).insertOne({
            _id: otpRecordId,
            userId: user._id.toString(),
            role: finalRole,
            isTeamMember,
            isOwner,
            ownerId: isTeamMember ? user.ownerId?.toString() : null,
            email: otpEmail,
            phone: otpPhone,
            purpose: "login",
            codeHash: hashOtpCode(otpCode),
            attempts: 0,
            maxAttempts: OTP_MAX_ATTEMPTS,
            createdAt: now,
            expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
            lastSentAt: now,
            resendCount: 0,
            redirectPath,
            collection: userCollection,
          });

          let delivery;
          try {
            delivery = await deliverOtp({
              email: otpEmail,
              phone: otpPhone,
              name: user.name || "User",
              code: otpCode,
            });
          } catch (sendErr) {
            await db.collection(OTP_COLLECTION).deleteOne({ _id: otpRecordId });
            console.error("OTP delivery failed:", sendErr);
            return NextResponse.json(
              {
                success: false,
                message: sendErr instanceof Error ? sendErr.message : "Failed to send OTP. Please try again.",
              },
              { status: 500 }
            );
          }

          return NextResponse.json(
            {
              success: false,
              requiresOtp: true,
              otpId: otpRecordId.toString(),
              message: delivery?.emailSent
                ? "OTP sent to your email and phone."
                : "OTP sent via SMS only. Email delivery failed.",
            },
            { status: 200 }
          );
        }

        // Determine permissions — prefer stored ones for team members
        let finalPermissions: string[] = [];

        if (finalRole === "propertyOwner") {
          finalPermissions = getDefaultPermissions("propertyOwner");
        } else if (isTeamMember) {
          // Use stored permissions if they exist and are non-empty
          finalPermissions = Array.isArray(user.permissions) && user.permissions.length > 0
            ? user.permissions
            : getDefaultPermissions(finalRole, true);
        } else if (finalRole === "tenant") {
          finalPermissions = getDefaultPermissions("tenant");
        }

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

        response.cookies.set("permissions", JSON.stringify(finalPermissions), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });

        // Set ownerId cookie for team members
        if (isTeamMember && user.ownerId) {
          response.cookies.set("ownerId", user.ownerId.toString(), {
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60,
            path: "/",
          });
        }

        response.cookies.set("csrf-token", uuidv4(), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 60 * 60,
          path: "/",
        });

        await db.collection(userCollection).updateOne(
          { _id: user._id },
          { $set: { lastLoginAt: now } }
        );

        console.log("Cookies set:", { 
          userId: user._id.toString(), 
          role: finalRole,
          permissions: finalPermissions,
          ownerId: isTeamMember ? user.ownerId?.toString() : undefined
        });
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
    let userCollection: "tenants" | "propertyOwners" | "teamMembers" | null = null;

    // 1. Check propertyOwners (most privileged)
    user = await db.collection("propertyOwners").findOne({
      email: new RegExp(`^${email}$`, "i"),
    });
    if (user) {
      finalRole = "propertyOwner";
      redirectPath = "/property-owner-dashboard";
      isOwner = true;
      userCollection = "propertyOwners";

      // ──── ADMIN APPROVAL CHECK ────
      if (user.isApproved === false) {
        return NextResponse.json(
          {
            success: false,
            message: "Your account is still pending admin approval. Please try again later or contact support.",
          },
          { status: 403 }
        );
      }
      // ─────────────────────────────────
    } else {
      // 2. Check teamMembers
      user = await db.collection("teamMembers").findOne({
        email: new RegExp(`^${email}$`, "i"),
      });
      if (user) {
        finalRole = user.role; // e.g. "Manager"
        redirectPath = "/property-owner-dashboard";
        isTeamMember = true;
        userCollection = "teamMembers";
      } else {
        // 3. Check tenants
        user = await db.collection("tenants").findOne({
          email: new RegExp(`^${email}$`, "i"),
        });
        if (user) {
          finalRole = "tenant";
          redirectPath = "/tenant-dashboard";
          userCollection = "tenants";
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
        if (!userCollection) {
          return NextResponse.json(
            { success: false, message: "Unable to resolve user collection" },
            { status: 500 }
          );
        }

        const now = new Date();
        const lastLoginAt = user.lastLoginAt ? new Date(user.lastLoginAt) : null;
        const requiresOtp =
          finalRole !== "propertyOwner" &&
          finalRole !== "tenant" &&
          (!lastLoginAt || Number.isNaN(lastLoginAt.getTime())
            ? true
            : now.getTime() - lastLoginAt.getTime() > OTP_REQUIRE_AFTER_MS);

        if (requiresOtp) {
          const otpEmail = user.email?.toString();
          const otpPhone = user.phone?.toString();

          if (!otpEmail || !otpPhone) {
            return NextResponse.json(
              { success: false, message: "Email and phone number are required for OTP login." },
              { status: 400 }
            );
          }

          const otpCode = generateOtpCode();
          const otpRecordId = new ObjectId();

          await db.collection(OTP_COLLECTION).deleteMany({
            userId: user._id.toString(),
            purpose: "login",
          });

          await db.collection(OTP_COLLECTION).insertOne({
            _id: otpRecordId,
            userId: user._id.toString(),
            role: finalRole,
            isTeamMember,
            isOwner,
            ownerId: isTeamMember ? user.ownerId?.toString() : null,
            email: otpEmail,
            phone: otpPhone,
            purpose: "login",
            codeHash: hashOtpCode(otpCode),
            attempts: 0,
            maxAttempts: OTP_MAX_ATTEMPTS,
            createdAt: now,
            expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
            lastSentAt: now,
            resendCount: 0,
            redirectPath,
            collection: userCollection,
          });

          let delivery;
          try {
            delivery = await deliverOtp({
              email: otpEmail,
              phone: otpPhone,
              name: user.name || "User",
              code: otpCode,
            });
          } catch (sendErr) {
            await db.collection(OTP_COLLECTION).deleteOne({ _id: otpRecordId });
            console.error("OTP delivery failed:", sendErr);
            return NextResponse.json(
              {
                success: false,
                message: sendErr instanceof Error ? sendErr.message : "Failed to send OTP. Please try again.",
              },
              { status: 500 }
            );
          }

          return NextResponse.json(
            {
              success: false,
              requiresOtp: true,
              otpId: otpRecordId.toString(),
              message: delivery?.emailSent
                ? "OTP sent to your email and phone."
                : "OTP sent via SMS only. Email delivery failed.",
            },
            { status: 200 }
          );
        }

        // Determine permissions — prefer stored ones for team members
        let finalPermissions: string[] = [];

        if (finalRole === "propertyOwner") {
          finalPermissions = getDefaultPermissions("propertyOwner");
        } else if (isTeamMember) {
          // Use stored permissions if they exist and are non-empty
          finalPermissions = Array.isArray(user.permissions) && user.permissions.length > 0
            ? user.permissions
            : getDefaultPermissions(finalRole, true);
        } else if (finalRole === "tenant") {
          finalPermissions = getDefaultPermissions("tenant");
        }

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

        response.cookies.set("permissions", JSON.stringify(finalPermissions), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 7 * 24 * 60 * 60,
          path: "/",
        });

        // Set ownerId cookie for team members
        if (isTeamMember && user.ownerId) {
          response.cookies.set("ownerId", user.ownerId.toString(), {
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60,
            path: "/",
          });
        }

        response.cookies.set("csrf-token", uuidv4(), {
          secure: process.env.NODE_ENV === "production",
          sameSite: "strict",
          maxAge: 60 * 60,
          path: "/",
        });

        await db.collection(userCollection).updateOne(
          { _id: user._id },
          { $set: { lastLoginAt: now } }
        );

        console.log("Cookies set:", { 
          userId: user._id.toString(), 
          role: finalRole,
          permissions: finalPermissions,
          ownerId: isTeamMember ? user.ownerId?.toString() : undefined
        });
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
