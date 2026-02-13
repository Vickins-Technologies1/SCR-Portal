// src/app/api/expenses/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { Expense } from "@/types/db";
import { ObjectId } from "mongodb";

export async function GET(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    const ownerIdParam = req.nextUrl.searchParams.get("ownerId");
    const period = req.nextUrl.searchParams.get("period") || "year";

    if (!ownerIdParam) {
      return NextResponse.json(
        { success: false, message: "ownerId query parameter is required" },
        { status: 400 }
      );
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    if (!sessionUserId || sessionUserId !== ownerIdParam) {
      logger.warn("Unauthorized expenses access attempt", { requestedOwner: ownerIdParam });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<Expense>("expenses");

    let query: any = {
      ownerId: new ObjectId(ownerIdParam),
    };

    if (period === "month") {
      const now = new Date();
      query.date = { $gte: new Date(now.getFullYear(), now.getMonth(), 1) };
    } else if (period === "year") {
      const now = new Date();
      query.date = { $gte: new Date(now.getFullYear(), 0, 1) };
    }

    const expenses = await collection
      .find(query)
      .sort({ date: -1 })
      .limit(200)
      .toArray();

    return NextResponse.json({
      success: true,
      expenses,
    });
  } catch (error) {
    logger.error("GET /api/expenses failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    const body = await req.json();
    const { ownerId, description, amount, category, date, propertyId, notes, receiptUrl } = body;

    if (!ownerId || !description || !amount || !category) {
      return NextResponse.json(
        { success: false, message: "Missing required fields: ownerId, description, amount, category" },
        { status: 400 }
      );
    }

    const submittedCsrf = req.headers.get("x-csrf-token") || "";
    const storedCsrf = req.cookies.get("csrf-token")?.value || "";
    if (!submittedCsrf || submittedCsrf !== storedCsrf) {
      logger.warn("CSRF validation failed on expense creation");
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    if (!sessionUserId || sessionUserId !== ownerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<Expense>("expenses");

    const now = new Date();
    const expenseDate = date ? new Date(date) : now;

    const result = await collection.insertOne({
      ownerId: new ObjectId(ownerId),
      propertyId: propertyId ? new ObjectId(propertyId) : null,
      description,
      amount: Number(amount),
      category,
      date: expenseDate,
      notes,
      receiptUrl,
      createdAt: now,
      updatedAt: now,
    });

    const newExpense = {
      _id: result.insertedId,
      ownerId: new ObjectId(ownerId),
      propertyId: propertyId ? new ObjectId(propertyId) : null,
      description,
      amount: Number(amount),
      category,
      date: expenseDate,
      notes,
      receiptUrl,
      createdAt: now,
      updatedAt: now,
    };

    logger.info(`Expense created`, { expenseId: result.insertedId, ownerId, amount });

    return NextResponse.json(
      {
        success: true,
        expense: newExpense,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("POST /api/expenses failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}