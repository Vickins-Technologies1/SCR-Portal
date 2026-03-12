import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { ObjectId } from "mongodb";

// ────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────

export interface Expense {
  _id: ObjectId;
  ownerId: ObjectId;
  propertyId?: ObjectId | null;
  description: string;
  amount: number;
  category: string;
  date: Date;
  notes?: string;
  receiptUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

type ExpenseInsert = Omit<Expense, "_id">;

// ────────────────────────────────────────────────
// GET - List expenses
// ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    const ownerIdParam = req.nextUrl.searchParams.get("ownerId");
    const period = req.nextUrl.searchParams.get("period") || "year";
    const propertyId = req.nextUrl.searchParams.get("propertyId");
    const startDate = req.nextUrl.searchParams.get("startDate");
    const endDate = req.nextUrl.searchParams.get("endDate");

    if (!ownerIdParam || !ObjectId.isValid(ownerIdParam)) {
      return NextResponse.json(
        { success: false, message: "Valid ownerId is required" },
        { status: 400 }
      );
    }

    const sessionUserId = req.cookies.get("userId")?.value;
    const sessionRole = req.cookies.get("role")?.value;

    if (!sessionUserId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    let effectiveOwnerId = ownerIdParam;

    if (sessionRole === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({
        _id: new ObjectId(sessionUserId),
        active: true,
      });

      if (!teamMember || !teamMember.ownerId) {
        return NextResponse.json(
          { success: false, message: "Team member not assigned to any owner" },
          { status: 403 }
        );
      }

      effectiveOwnerId = teamMember.ownerId.toString();
    } else if (sessionRole !== "propertyOwner" || sessionUserId !== ownerIdParam) {
      logger.warn("Unauthorized expenses access attempt", {
        requestedOwner: ownerIdParam,
        sessionUser: sessionUserId,
        role: sessionRole,
      });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<Expense>("expenses");

    const query: any = {
      ownerId: new ObjectId(effectiveOwnerId),
    };

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.date.$lte = end;
      }
    } else if (period === "month") {
      const now = new Date();
      query.date = { $gte: new Date(now.getFullYear(), now.getMonth(), 1) };
    } else if (period === "year") {
      const now = new Date();
      query.date = { $gte: new Date(now.getFullYear(), 0, 1) };
    }

    if (propertyId && ObjectId.isValid(propertyId)) {
      query.propertyId = new ObjectId(propertyId);
    }

    const expenses = await collection
      .aggregate([
        { $match: query },
        { $sort: { date: -1 } },
        { $limit: 300 },
        {
          $lookup: {
            from: "properties",
            localField: "propertyId",
            foreignField: "_id",
            as: "property",
          },
        },
        { $unwind: { path: "$property", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: { $toString: "$_id" },
            description: 1,
            amount: 1,
            category: 1,
            date: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
            propertyName: { $ifNull: ["$property.name", null] },
            propertyId: { $ifNull: [{ $toString: "$propertyId" }, null] },
            notes: 1,
            receiptUrl: 1,           // ← ensure it's included
          },
        },
      ])
      .toArray();

    return NextResponse.json({
      success: true,
      expenses,
    });
  } catch (error) {
    logger.error("GET /api/expenses failed", { error });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

// ────────────────────────────────────────────────
// POST - Create new expense
// ────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { db } = await connectToDatabase();

    const body = await req.json();
    const {
      ownerId,
      description,
      amount,
      category,
      date,
      propertyId,
      notes,
      receiptUrl,
    } = body;

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
    const sessionRole = req.cookies.get("role")?.value;

    if (!sessionUserId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    let effectiveOwnerId = ownerId;

    if (sessionRole === "teamMember") {
      const teamMember = await db.collection("teamMembers").findOne({
        _id: new ObjectId(sessionUserId),
        active: true,
      });

      if (!teamMember || teamMember.ownerId.toString() !== ownerId) {
        return NextResponse.json(
          { success: false, message: "Unauthorized – not assigned to this owner" },
          { status: 403 }
        );
      }
    } else if (sessionRole !== "propertyOwner" || sessionUserId !== ownerId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    const collection = db.collection<ExpenseInsert>("expenses");

    const now = new Date();
    const expenseDate = date ? new Date(date) : now;

    const expenseToInsert: ExpenseInsert = {
      ownerId: new ObjectId(ownerId),
      propertyId: propertyId && ObjectId.isValid(propertyId)
        ? new ObjectId(propertyId)
        : null,
      description,
      amount: Number(amount),
      category,
      date: expenseDate,
      notes,
      receiptUrl,                  // ← now accepted
      createdAt: now,
      updatedAt: now,
    };

    const result = await collection.insertOne(expenseToInsert);

    const newExpense = {
      _id: result.insertedId.toString(),
      ...expenseToInsert,
      ownerId: ownerId,
      propertyId: propertyId || null,
      date: expenseDate.toISOString().split("T")[0],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };

    logger.info(`Expense created`, {
      expenseId: result.insertedId,
      ownerId,
      amount,
      hasReceipt: !!receiptUrl,
    });

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