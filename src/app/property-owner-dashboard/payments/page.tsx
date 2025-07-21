import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import axios from "axios";

export async function POST(req: NextRequest) {
  const { tenantId, amount, userId, role } = await req.json();

  if (!tenantId || !amount || amount <= 0 || !userId || role !== "tenant") {
    return NextResponse.json({ success: false, message: "Invalid parameters" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId) });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    if (tenant._id.toString() !== userId) {
      return NextResponse.json({ success: false, message: "Unauthorized access" }, { status: 403 });
    }

    // M-Pesa STK Push
    const mpesaResponse = await axios.post(
      "https://api.umspay.com/v1/payments/stk-push",
      {
        api_key: process.env.UMS_PAY_API_KEY,
        email: process.env.UMS_PAY_EMAIL,
        phone_number: tenant.phone,
        amount,
      },
      { headers: { "Content-Type": "application/json" } }
    );

    if (mpesaResponse.data.status !== "success") {
      return NextResponse.json({ success: false, message: "Payment initiation failed" }, { status: 400 });
    }

    // Check M-Pesa transaction status
    const statusResponse = await axios.get(
      `https://api.umspay.com/v1/payments/status?transaction_id=${mpesaResponse.data.transaction_id}`,
      { headers: { Authorization: `Bearer ${process.env.UMS_PAY_API_KEY}` } }
    );

    if (statusResponse.data.status !== "completed") {
      return NextResponse.json({ success: false, message: "Payment not completed" }, { status: 400 });
    }

    const monthlyRent = tenant.price;
    let walletCredit = 0;
    let rentPaid = amount;

    if (amount > monthlyRent) {
      walletCredit = amount - monthlyRent;
      rentPaid = monthlyRent;
    }

    // Update payment status and wallet
    await db.collection("tenants").updateOne(
      { _id: new ObjectId(tenantId) },
      {
        $set: {
          paymentStatus: rentPaid >= monthlyRent ? "paid" : "overdue",
          updatedAt: new Date().toISOString(),
        },
        $inc: { walletBalance: walletCredit },
      }
    );

    // Record payment
    await db.collection("payments").insertOne({
      tenantId,
      amount: rentPaid,
      propertyId: tenant.propertyId,
      paymentDate: new Date().toISOString(),
      transactionId: mpesaResponse.data.transaction_id,
      status: "completed",
    });

    // Record wallet transaction if excess
    if (walletCredit > 0) {
      await db.collection("walletTransactions").insertOne({
        tenantId,
        type: "credit",
        amount: walletCredit,
        createdAt: new Date().toISOString(),
        description: "Excess payment credited",
      });
    }

    return NextResponse.json({
      success: true,
      message: "Payment processed successfully",
      walletBalance: (tenant.walletBalance || 0) + walletCredit,
    }, { status: 200 });
  } catch (error) {
    console.error("Error processing payment:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const tenantId = req.nextUrl.searchParams.get("tenantId");
  const userId = req.nextUrl.searchParams.get("userId");
  const role = req.nextUrl.searchParams.get("role");

  if (!tenantId || !userId || !role || !["tenant", "propertyOwner"].includes(role)) {
    return NextResponse.json({ success: false, message: "Invalid parameters" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId) });

    if (!tenant) {
      return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
    }

    if (role === "tenant" && tenant._id.toString() !== userId) {
      return NextResponse.json({ success: false, message: "Unauthorized access" }, { status: 403 });
    }

    if (role === "propertyOwner") {
      const property = await db.collection("properties").findOne({ _id: new ObjectId(tenant.propertyId), userId });
      if (!property) {
        return NextResponse.json({ success: false, message: "Unauthorized access to tenant" }, { status: 403 });
      }
    }

    const payments = await db.collection("payments").find({ tenantId }).toArray();
    return NextResponse.json({ success: true, payments }, { status: 200 });
  } catch (error) {
    console.error("Error fetching payments:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}