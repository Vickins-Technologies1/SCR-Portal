import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ownerId = url.searchParams.get("ownerId");

  if (!ownerId) {
    return NextResponse.json({ success: false, message: "Missing ownerId" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const owner = await db.collection("owners").findOne({ _id: new ObjectId(ownerId) });
    if (!owner) {
      return NextResponse.json({ success: false, message: "Owner not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, paymentSettings: owner.paymentSettings || {} });
  } catch (error) {
    console.error("Error in GET /api/owner/payment-settings:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const {
      ownerId,
      stripeEnabled,
      stripeApiKey,
      paypalEnabled,
      paypalClientId,
      bankTransferEnabled,
      bankAccountDetails,
      umsPayEnabled,
      umsPayApiKey,
      umsPayEmail,
      umsPayAccountId,
    } = await request.json();

    if (!ownerId) {
      return NextResponse.json({ success: false, message: "Missing ownerId" }, { status: 400 });
    }

    const paymentSettings = {
      stripeEnabled: !!stripeEnabled,
      stripeApiKey: stripeApiKey || "",
      paypalEnabled: !!paypalEnabled,
      paypalClientId: paypalClientId || "",
      bankTransferEnabled: !!bankTransferEnabled,
      bankAccountDetails: bankAccountDetails || "",
      umsPayEnabled: !!umsPayEnabled,
      umsPayApiKey: umsPayApiKey || "",
      umsPayEmail: umsPayEmail || "",
      umsPayAccountId: umsPayAccountId || "",
    };

    const { db } = await connectToDatabase();
    const result = await db.collection("owners").updateOne(
      { _id: new ObjectId(ownerId) },
      { $set: { paymentSettings } }
    );

    if (result.modifiedCount === 0) {
      return NextResponse.json({ success: false, message: "Failed to update payment settings" }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: "Payment settings updated" });
  } catch (error) {
    console.error("Error in PUT /api/owner/payment-settings:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}