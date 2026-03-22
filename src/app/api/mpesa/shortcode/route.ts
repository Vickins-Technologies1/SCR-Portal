// src/app/api/mpesa/shortcode/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId, Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import logger from "@/lib/logger";

const QuerySchema = z.object({
  landlordId: z.string().trim().min(1),
});

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || !["tenant", "propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({ landlordId: searchParams.get("landlordId") || "" });
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid landlordId" }, { status: 400 });
  }

  try {
    if (role === "tenant") {
      const { db }: { db: Db } = await connectToDatabase();
      const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(userId) });
      if (!tenant || tenant.ownerId?.toString?.() !== parsed.data.landlordId) {
        return NextResponse.json({ success: false, message: "Unauthorized landlord access" }, { status: 403 });
      }
    }

    if (role === "propertyOwner" && userId !== parsed.data.landlordId) {
      return NextResponse.json({ success: false, message: "Unauthorized landlord access" }, { status: 403 });
    }

    await connectMongoose();
    const landlordMpesa = await LandlordMpesa.findOne({ landlord: parsed.data.landlordId }).lean();

    return NextResponse.json({
      success: true,
      shortcode: landlordMpesa?.shortcode || null,
    });
  } catch (error) {
    logger.error("GET /api/mpesa/shortcode error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return NextResponse.json({ success: false, message: "Failed to fetch shortcode" }, { status: 500 });
  }
}
