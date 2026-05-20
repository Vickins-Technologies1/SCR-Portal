import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../../lib/mongodb";
import { Db, ObjectId } from "mongodb";
import { computeExpectedMonthlyIncome, getGracePeriodEndDate, resolveBillingPlan, upsertPercentageInvoice } from "../../../../../lib/billing";
import { Property } from "../../../../../types/property";
import { requireAdmin } from "../../../../../lib/admin-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request, "admin:properties:view");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;   // ← await here

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const property = await db.collection<Property>('properties').findOne({ _id: new ObjectId(id) });
    if (!property) {
      return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });
    }


    return NextResponse.json({
      success: true,
      property: {
        ...property,
        _id: property._id.toString(),
      },
    });
  } catch (error: unknown) {
    console.error("Property fetch error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request, "admin:properties:edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;   // ← await here

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { name, ownerId, managementFeePercent, createInvoice } = body;

    const updateData: any = { updatedAt: new Date() };
    if (managementFeePercent !== undefined) {
      if (typeof managementFeePercent !== "number" || managementFeePercent < 0 || managementFeePercent > 100) {
        return NextResponse.json(
          { success: false, message: "managementFeePercent must be a number between 0 and 100" },
          { status: 400 }
        );
      }
      updateData.managementFeePercent = managementFeePercent;
    }
    if (name !== undefined) updateData.name = name;
    if (ownerId !== undefined) updateData.ownerId = new ObjectId(ownerId);

    const { db }: { db: Db } = await connectToDatabase();

    const property = await db.collection<Property>("properties").findOne({ _id: new ObjectId(id) });
    if (!property) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    const result = await db.collection("properties").findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updateData },
      { returnDocument: "after" }
    );

    if (!result) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    let invoiceResult: any = null;

    if (createInvoice) {
      const billingPlan = resolveBillingPlan(property);
      if (billingPlan !== "FullManagement") {
        return NextResponse.json(
          { success: false, message: "Cannot create a full management invoice for a software leasing property." },
          { status: 400 }
        );
      }

      const percentToUse = managementFeePercent !== undefined ? managementFeePercent : property.managementFeePercent;
      if (!percentToUse || percentToUse <= 0) {
        return NextResponse.json(
          { success: false, message: "managementFeePercent must be greater than 0 to create an invoice." },
          { status: 400 }
        );
      }

      const now = new Date();
      const expectedIncome = await computeExpectedMonthlyIncome(db, property._id.toString(), now);
      if (expectedIncome <= 0) {
        return NextResponse.json(
          { success: false, message: "Expected monthly income is 0. Add tenants before creating this invoice." },
          { status: 400 }
        );
      }

      const dueDate = getGracePeriodEndDate(property.createdAt ? new Date(property.createdAt) : now, now);
      const description = `Full management fee (${percentToUse}% of expected monthly income Ksh ${expectedIncome.toFixed(2)}) for ${now.toLocaleString("default", { month: "long", year: "numeric" })}`;

      invoiceResult = await upsertPercentageInvoice({
        db,
        userId: String(property.ownerId),
        propertyId: property._id.toString(),
        billingPlan: "FullManagement",
        percentage: percentToUse,
        expectedIncome,
        description,
        expiresAt: dueDate,
        now,
      });
    }

    return NextResponse.json({
      success: true,
      property: {
        ...result,
        _id: result._id.toString(),
      },
      invoice: invoiceResult,
    });
  } catch (error: unknown) {
    console.error("Property update error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request, "admin:properties:edit");
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;   // ← await here

  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const property = await db.collection<Property>('properties').findOne({ _id: new ObjectId(id) });
    if (!property) {
      return NextResponse.json({ success: false, message: 'Property not found' }, { status: 404 });
    }
    const result = await db.collection("properties").deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ success: false, message: "Property not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Property deleted successfully" });
  } catch (error: unknown) {
    console.error("Property delete error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}















