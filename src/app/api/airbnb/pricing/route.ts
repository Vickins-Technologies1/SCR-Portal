import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const rules = await db
    .collection("airbnbPricingRules")
    .find({ ownerId })
    .sort({ createdAt: -1 })
    .toArray();

  const settings =
    (await db.collection("airbnbPricingSettings").findOne({ ownerId })) as
      | {
          demandBased?: boolean;
          competitorAware?: boolean;
          lastMinuteDiscount?: boolean;
        }
      | null;

  return NextResponse.json({
    success: true,
    settings: {
      demandBased: settings?.demandBased ?? true,
      competitorAware: settings?.competitorAware ?? true,
      lastMinuteDiscount: settings?.lastMinuteDiscount ?? false,
    },
    rules: rules.map((rule) => ({
      id: rule.externalId || rule._id?.toString?.() || "",
      name: rule.name,
      description: rule.description,
      adjustment: rule.adjustment,
      active: Boolean(rule.active),
    })),
  });
}

const PricingActionSchema = z.object({
  action: z.enum(["applySmartRates", "toggleRule", "updateSettings"]),
  ruleId: z.string().optional(),
  active: z.boolean().optional(),
  settings: z
    .object({
      demandBased: z.boolean().optional(),
      competitorAware: z.boolean().optional(),
      lastMinuteDiscount: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = PricingActionSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid pricing payload" }, { status: 400 });
  }

  const { db } = await connectToDatabase();

  if (parsed.data.action === "updateSettings") {
    await db.collection("airbnbPricingSettings").updateOne(
      { ownerId },
      {
        $set: {
          ...(parsed.data.settings || {}),
          updatedAt: new Date().toISOString(),
        },
        $setOnInsert: { ownerId, createdAt: new Date().toISOString() },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true });
  }

  if (parsed.data.action === "toggleRule") {
    if (!parsed.data.ruleId || typeof parsed.data.active !== "boolean") {
      return NextResponse.json({ success: false, message: "Missing rule update data" }, { status: 400 });
    }

    const filter = ObjectId.isValid(parsed.data.ruleId)
      ? { _id: new ObjectId(parsed.data.ruleId), ownerId }
      : { externalId: parsed.data.ruleId, ownerId };

    await db.collection("airbnbPricingRules").updateOne(
      filter,
      { $set: { active: parsed.data.active, updatedAt: new Date().toISOString() } }
    );

    return NextResponse.json({ success: true });
  }

  // applySmartRates
  const listings = await db.collection("airbnbListings").find({ ownerId }).toArray();
  const updatedListings = [];

  for (const listing of listings) {
    const baseRate = Number(listing.baseRate || 0);
    const weekendRate = Number(listing.weekendRate || baseRate);
    const occupancy = Number(listing.occupancyRate || 0);

    let multiplier = 1;
    if (occupancy >= 80) {
      multiplier = 1.08;
    } else if (occupancy <= 40) {
      multiplier = 0.92;
    }

    const newBaseRate = Math.round(baseRate * multiplier);
    const newWeekendRate = Math.round(weekendRate * multiplier);

    await db.collection("airbnbListings").updateOne(
      { _id: listing._id },
      {
        $set: {
          baseRate: newBaseRate,
          weekendRate: newWeekendRate,
          pricingStrategy: "smart",
          updatedAt: new Date().toISOString(),
        },
      }
    );

    updatedListings.push({ id: listing.externalId || listing._id?.toString?.(), baseRate: newBaseRate });
  }

  return NextResponse.json({
    success: true,
    message: "Smart rates applied to active listings.",
    updatedListings,
  });
}
