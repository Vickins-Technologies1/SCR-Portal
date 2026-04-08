import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const inventoryItems = await db
    .collection("airbnbInventoryItems")
    .find({ ownerId })
    .sort({ updatedAt: -1 })
    .limit(6)
    .toArray();

  const smartLocks = await db.collection("airbnbSmartLocks").find({ ownerId }).toArray();
  const smartLockSummary = smartLocks.reduce(
    (acc, lock) => {
      const status = lock.status || "unknown";
      if (status === "ready") acc.ready += 1;
      else if (status === "pending") acc.pending += 1;
      else if (status === "offline") acc.offline += 1;
      else acc.unknown += 1;
      acc.total += 1;
      return acc;
    },
    { ready: 0, pending: 0, offline: 0, unknown: 0, total: 0 }
  );

  return NextResponse.json({
    success: true,
    inventory: inventoryItems.map((item) => ({
      id: item.externalId || item._id?.toString?.() || "",
      name: item.name,
      quantity: Number(item.quantity || 0),
      unit: item.unit,
    })),
    smartLocks: smartLockSummary,
  });
}
