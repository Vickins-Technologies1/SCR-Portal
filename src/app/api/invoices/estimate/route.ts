import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";
import {
  computeExpectedMonthlyIncome,
  resolveBillingPlan,
  roundCurrency,
  SOFTWARE_LEASING_PERCENT,
  getBillingMonth,
} from "../../../../lib/billing";
import { Property } from "../../../../types/property";

export async function GET(request: NextRequest) {
  try {
    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;
    const ownerIdCookie = request.cookies.get("ownerId")?.value;

    if (!userId || !ObjectId.isValid(userId) || !["propertyOwner", "teamMember"].includes(role || "")) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    const ownerId = role === "propertyOwner" ? userId : (ownerIdCookie || userId);
    if (!ownerId || !ObjectId.isValid(ownerId)) {
      return NextResponse.json({ success: false, message: "Invalid owner ID" }, { status: 400 });
    }

    const { db } = await connectToDatabase();

    const ownerFilter = ObjectId.isValid(ownerId)
      ? { $in: [ownerId, new ObjectId(ownerId)] }
      : ownerId;

    const properties = await db
      .collection<Property>("properties")
      .find({ ownerId: ownerFilter })
      .toArray();

    const targetDate = new Date();
    targetDate.setMonth(targetDate.getMonth() + 1, 1);
    const periodLabel = targetDate.toLocaleString("default", { month: "long", year: "numeric" });
    const billingMonth = getBillingMonth(targetDate);

    const items = await Promise.all(
      properties.map(async (property) => {
        const propertyId = property._id.toString();
        const billingPlan = resolveBillingPlan(property);
        const percentage =
          billingPlan === "FullManagement"
            ? Math.max(0, property.managementFeePercent ?? 0)
            : SOFTWARE_LEASING_PERCENT;
        const expectedIncome = await computeExpectedMonthlyIncome(db, propertyId, targetDate);
        const estimatedAmount = roundCurrency((expectedIncome * percentage) / 100);

        return {
          propertyId,
          propertyName: property.name || "Property",
          billingPlan,
          percentage,
          expectedIncome,
          estimatedAmount,
        };
      })
    );

    const total = roundCurrency(items.reduce((sum, item) => sum + (item.estimatedAmount || 0), 0));

    return NextResponse.json({
      success: true,
      period: { billingMonth, label: periodLabel },
      total,
      items,
    });
  } catch (error) {
    console.error("Error estimating invoices", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}
