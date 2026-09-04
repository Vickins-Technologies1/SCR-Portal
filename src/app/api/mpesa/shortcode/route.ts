// src/app/api/mpesa/shortcode/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ObjectId, Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import logger from "@/lib/logger";
import { resolveAccountTier } from "@/lib/tier";
import { listLandlordMpesaConnections, resolveLandlordMpesaRouting } from "@/lib/mpesa-routing";

const QuerySchema = z.object({
  landlordId: z.string().trim().min(1),
  propertyId: z.string().trim().optional().nullable(),
});

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || !role || !["tenant", "propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = QuerySchema.safeParse({
    landlordId: searchParams.get("landlordId") || "",
    propertyId: searchParams.get("propertyId") || null,
  });
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

    const resolved = await resolveLandlordMpesaRouting({
      landlordId: parsed.data.landlordId,
      propertyId: parsed.data.propertyId || undefined,
    });

    const connections = await listLandlordMpesaConnections({ landlordId: parsed.data.landlordId });
    const paymentType = resolved.paymentType;
    const paybillAccountNumber = resolved.paybillAccountNumber || "";
    const shortcode = resolved.shortcode;

    return NextResponse.json({
      success: true,
      shortcode,
      paymentType,
      paybillAccountNumber,
      connections,
    });
  } catch (error) {
    logger.error("GET /api/mpesa/shortcode error", {
      message: error instanceof Error ? error.message : String(error),
      userId,
    });
    return NextResponse.json({ success: false, message: "Failed to fetch shortcode" }, { status: 500 });
  }
}
