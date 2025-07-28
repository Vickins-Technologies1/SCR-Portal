import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { connectToDatabase } from "../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import logger from "../../../lib/logger";

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    const { userId, amount, reference } = await request.json();
    if (!userId || !ObjectId.isValid(userId) || typeof amount !== "number") {
      logger.warn("Invalid request data", { userId, amount });
      return NextResponse.json(
        { success: false, message: "Invalid user ID or amount" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const authUserId = cookieStore.get("userId")?.value;
    if (!authUserId || authUserId !== userId) {
      logger.warn("Unauthorized wallet update attempt", { userId, authUserId });
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();
    const user = await db.collection("propertyOwners").findOne({ _id: new ObjectId(userId) });
    if (!user) {
      logger.warn("User not found", { userId });
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    const newBalance = user.walletBalance + amount;
    if (newBalance < 0) {
      logger.warn("Insufficient wallet balance", { userId, currentBalance: user.walletBalance, amount });
      return NextResponse.json(
        { success: false, message: "Insufficient wallet balance" },
        { status: 400 }
      );
    }

    await db.collection("propertyOwners").updateOne(
      { _id: new ObjectId(userId) },
      { $set: { walletBalance: newBalance } }
    );

    if (reference) {
      await db.collection("invoices").updateOne(
        { reference, userId },
        { $set: { status: "completed", updatedAt: new Date() } }
      );
      logger.debug("Updated invoice status", { reference, status: "completed" });
    }

    logger.info("Wallet updated successfully", { userId, newBalance, duration: Date.now() - startTime });
    return NextResponse.json(
      { success: true, message: "Wallet updated successfully", newBalance },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error("Error in POST /api/update-wallet", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}