// src/app/api/mpesa/shortcode/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId, Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { connectMongoose } from "@/lib/mongoose";
import { LandlordMpesa } from "@/models/LandlordMpesa";
import { getMpesaShortcode } from "@/lib/mpesa";
import logger from "@/lib/logger";
import { resolveAccountTier } from "@/lib/tier";

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

      const ownerTier = resolveAccountTier(
        (
          await db.collection("propertyOwners").findOne(
            { _id: new ObjectId(parsed.data.landlordId), role: "propertyOwner" },
            { projection: { tier: 1 } }
          )
        )?.tier,
        "premium"
      );

      if (ownerTier === "free") {
        return NextResponse.json({
          success: true,
          shortcode: null,
          paymentType: "unknown",
          paybillAccountNumber: "",
        });
      }
    }

    if (role === "propertyOwner" && userId !== parsed.data.landlordId) {
      return NextResponse.json({ success: false, message: "Unauthorized landlord access" }, { status: 403 });
    }

    let shortcode = "";
    let paymentType: "paybill" | "till" | "bank" | "unknown" = "unknown";
    let paybillAccountNumber = "";

    try {
      await connectMongoose();
      const doc = await LandlordMpesa.findOne({ landlord: parsed.data.landlordId })
        .select({ paymentType: 1, paybillNumber: 1, tillNumber: 1, paybillAccountNumber: 1, shortcode: 1 })
        .lean<{
          paymentType?: string;
          paybillNumber?: string;
          tillNumber?: string;
          paybillAccountNumber?: string;
          shortcode?: string;
        }>()
        .exec();

      paymentType =
        doc?.paymentType === "till" || doc?.paymentType === "paybill" || doc?.paymentType === "bank"
          ? doc.paymentType
          : "unknown";
      paybillAccountNumber = doc?.paybillAccountNumber || "";
      if (doc?.paymentType === "till" && doc?.tillNumber) {
        shortcode = doc.tillNumber;
      } else if (doc?.paymentType === "paybill" && doc?.paybillNumber) {
        shortcode = doc.paybillNumber;
      } else if (doc?.shortcode) {
        shortcode = doc.shortcode;
      }
    } catch {
      shortcode = "";
    }

    if (!shortcode) {
      shortcode = getMpesaShortcode();
      if (paymentType === "unknown") paymentType = "paybill";
    }

    return NextResponse.json({
      success: true,
      shortcode,
      paymentType,
      paybillAccountNumber,
    });
  } catch (error) {
    logger.error("GET /api/mpesa/shortcode error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return NextResponse.json({ success: false, message: "Failed to fetch shortcode" }, { status: 500 });
  }
}
