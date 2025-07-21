import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";
import axios from "axios";

// DB Connection
const connectToDatabase = async () => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  try {
    await client.connect();
    const db = client.db("rentaldb");
    console.log("Connected to MongoDB database:", db.databaseName);
    return { db, client };
  } catch (error) {
    console.error("Failed to connect to MongoDB:", error);
    throw new Error("Database connection failed");
  }
};

// Interfaces
interface Tenant {
  _id: ObjectId;
  name: string;
  email: string;
  phone: string;
  propertyId: ObjectId | string;
  unitType: string;
  price: number;
  deposit: number;
  houseNumber: string;
  leaseStartDate: string;
  leaseEndDate: string;
  status: string;
  paymentStatus: string;
  ownerId: string;
  createdAt: string;
  updatedAt?: string;
  walletBalance: number;
}

interface Payment {
  _id?: ObjectId;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: string;
}

interface WalletTransaction {
  tenantId: string;
  type: "credit" | "debit";
  amount: number;
  createdAt: string;
  description: string;
}

// POST /api/payments
export async function POST(req: NextRequest) {
  try {
    const { tenantId, amount, userId, role } = await req.json();
    console.log("POST /api/payments - Request body:", { tenantId, amount, userId, role });

    // Validate input
    if (!tenantId || !ObjectId.isValid(tenantId)) {
      console.log("Invalid tenantId:", tenantId);
      return NextResponse.json({ success: false, message: "Invalid tenant ID" }, { status: 400 });
    }
    if (!amount || typeof amount !== "number" || amount <= 0) {
      console.log("Invalid amount:", amount);
      return NextResponse.json({ success: false, message: "Amount must be a positive number" }, { status: 400 });
    }
    if (!userId || !ObjectId.isValid(userId) || role !== "tenant") {
      console.log("Invalid userId or role:", { userId, role });
      return NextResponse.json({ success: false, message: "Unauthorized: Invalid user or role" }, { status: 401 });
    }

    const { db, client } = await connectToDatabase();
    try {
      const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(tenantId) });

      if (!tenant) {
        console.log("Tenant not found:", tenantId);
        return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
      }

      if (tenant._id.toString() !== userId) {
        console.log("Unauthorized access - tenantId:", tenantId, "userId:", userId);
        return NextResponse.json({ success: false, message: "Unauthorized access" }, { status: 403 });
      }

      // Validate propertyId
      if (!tenant.propertyId || !ObjectId.isValid(tenant.propertyId)) {
        console.log("Invalid propertyId in tenant:", tenant.propertyId);
        return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
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

      console.log("M-Pesa STK Push response:", mpesaResponse.data);

      if (mpesaResponse.data.status !== "success") {
        console.log("Payment initiation failed:", mpesaResponse.data);
        return NextResponse.json({ success: false, message: "Payment initiation failed" }, { status: 400 });
      }

      // Check M-Pesa transaction status
      const statusResponse = await axios.get(
        `https://api.umspay.com/v1/payments/status?transaction_id=${mpesaResponse.data.transaction_id}`,
        { headers: { Authorization: `Bearer ${process.env.UMS_PAY_API_KEY}` } }
      );

      console.log("M-Pesa transaction status:", statusResponse.data);

      if (statusResponse.data.status !== "completed") {
        console.log("Payment not completed:", statusResponse.data);
        return NextResponse.json({ success: false, message: "Payment not completed" }, { status: 400 });
      }

      const monthlyRent = tenant.price;
      let walletCredit = 0;
      let rentPaid = amount;

      if (amount > monthlyRent) {
        walletCredit = amount - monthlyRent;
        rentPaid = monthlyRent;
      }

      // Update tenant payment status and wallet balance
      const updateResult = await db.collection<Tenant>("tenants").updateOne(
        { _id: new ObjectId(tenantId) },
        {
          $set: {
            paymentStatus: rentPaid >= monthlyRent ? "paid" : "overdue",
            updatedAt: new Date().toISOString(),
          },
          $inc: { walletBalance: walletCredit },
        }
      );

      if (updateResult.matchedCount === 0) {
        console.log("Failed to update tenant:", tenantId);
        return NextResponse.json({ success: false, message: "Failed to update tenant" }, { status: 500 });
      }

      // Record payment
      const payment: Payment = {
        tenantId,
        amount: rentPaid,
        propertyId: tenant.propertyId.toString(),
        paymentDate: new Date().toISOString(),
        transactionId: mpesaResponse.data.transaction_id,
        status: "completed",
      };

      await db.collection<Payment>("payments").insertOne(payment);
      console.log("Payment recorded:", payment);

      // Record wallet transaction if excess
      if (walletCredit > 0) {
        const walletTransaction: WalletTransaction = {
          tenantId,
          type: "credit",
          amount: walletCredit,
          createdAt: new Date().toISOString(),
          description: "Excess payment credited to wallet",
        };
        await db.collection<WalletTransaction>("walletTransactions").insertOne(walletTransaction);
        console.log("Wallet transaction recorded:", walletTransaction);
      }

      return NextResponse.json({
        success: true,
        message: "Payment processed successfully",
        walletBalance: (tenant.walletBalance || 0) + walletCredit,
      }, { status: 200 });
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("Error processing payment:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message: `Server error: ${errorMessage}` }, { status: 500 });
  }
}

// GET /api/payments
export async function GET(req: NextRequest) {
  try {
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    const userId = req.nextUrl.searchParams.get("userId");
    const role = req.nextUrl.searchParams.get("role");
    console.log("GET /api/payments - Query params:", { tenantId, userId, role });

    if (!tenantId || !ObjectId.isValid(tenantId) || !userId || !ObjectId.isValid(userId) || !role || !["tenant", "propertyOwner"].includes(role)) {
      console.log("Invalid parameters:", { tenantId, userId, role });
      return NextResponse.json({ success: false, message: "Invalid parameters" }, { status: 400 });
    }

    const { db, client } = await connectToDatabase();
    try {
      const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(tenantId) });

      if (!tenant) {
        console.log("Tenant not found:", tenantId);
        return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
      }

      if (role === "tenant" && tenant._id.toString() !== userId) {
        console.log("Unauthorized access - tenantId:", tenantId, "userId:", userId);
        return NextResponse.json({ success: false, message: "Unauthorized access" }, { status: 403 });
      }

      if (role === "propertyOwner") {
        const property = await db.collection("properties").findOne({
          _id: new ObjectId(tenant.propertyId),
          ownerId: userId,
        });
        if (!property) {
          console.log("Unauthorized access to tenant - tenantId:", tenantId, "userId:", userId);
          return NextResponse.json({ success: false, message: "Unauthorized access to tenant" }, { status: 403 });
        }
      }

      const payments = await db.collection<Payment>("payments").find({ tenantId }).toArray();
      console.log(`Found ${payments.length} payments for tenant:`, tenantId);

      return NextResponse.json({
        success: true,
        payments: payments.map((payment) => ({
          ...payment,
          _id: payment._id?.toString(),
          tenantId: payment.tenantId,
          propertyId: payment.propertyId,
          paymentDate: payment.paymentDate,
          transactionId: payment.transactionId,
          status: payment.status,
        })),
      }, { status: 200 });
    } finally {
      await client.close();
      console.log("MongoDB connection closed");
    }
  } catch (error) {
    console.error("Error fetching payments:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ success: false, message: `Server error: ${errorMessage}` }, { status: 500 });
  }
}