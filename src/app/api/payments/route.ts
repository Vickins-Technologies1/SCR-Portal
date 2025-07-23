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
  createdAt: string | Date;
  updatedAt?: string;
  walletBalance: number;
}

interface User {
  _id: ObjectId;
  role: string;
  email: string;
  phone: string;
  paymentStatus: string;
  walletBalance: number;
}

interface Payment {
  _id?: ObjectId;
  userId: string;
  role: "tenant" | "propertyOwner";
  amount: number;
  propertyId: string;
  unitType?: string;
  paymentDate: string;
  transactionId: string;
  status: string;
}

interface WalletTransaction {
  userId: string;
  type: "credit" | "debit";
  amount: number;
  createdAt: string;
  description: string;
}

// POST /api/payments (unchanged)
export async function POST(req: NextRequest) {
  try {
    const { userId, propertyId, unitType, amount, role } = await req.json();
    console.log("POST /api/payments - Request body:", { userId, propertyId, unitType, amount, role });

    // Validate input
    if (!userId || !ObjectId.isValid(userId)) {
      console.log("Invalid userId:", userId);
      return NextResponse.json({ success: false, message: "Invalid user ID" }, { status: 400 });
    }
    if (!propertyId || !ObjectId.isValid(propertyId)) {
      console.log("Invalid propertyId:", propertyId);
      return NextResponse.json({ success: false, message: "Invalid property ID" }, { status: 400 });
    }
    if (!amount || typeof amount !== "number" || amount <= 0) {
      console.log("Invalid amount:", amount);
      return NextResponse.json({ success: false, message: "Amount must be a positive number" }, { status: 400 });
    }
    if (!role || !["tenant", "propertyOwner"].includes(role)) {
      console.log("Invalid role:", role);
      return NextResponse.json({ success: false, message: "Invalid role" }, { status: 400 });
    }

    const { db, client } = await connectToDatabase();
    try {
      if (role === "propertyOwner") {
        // Property Owner Payment Logic
        if (!unitType) {
          console.log("Unit type required for property owner payment");
          return NextResponse.json({ success: false, message: "Unit type is required" }, { status: 400 });
        }

        // Verify user is a property owner
        const user = await db.collection<User>("users").findOne({
          _id: new ObjectId(userId),
          role: "propertyOwner",
        });
        if (!user) {
          console.log("User not found or not a property owner:", userId);
          return NextResponse.json({ success: false, message: "User not found or not authorized" }, { status: 404 });
        }

        // Validate property and unit type
        const property = await db.collection("properties").findOne({
          _id: new ObjectId(propertyId),
          ownerId: new ObjectId(userId),
        });
        if (!property) {
          console.log("Property not found or not authorized:", propertyId);
          return NextResponse.json({ success: false, message: "Property not found or not authorized" }, { status: 404 });
        }

        const unit = property.unitTypes.find((u: any) => u.type === unitType);
        if (!unit || typeof unit.managementFee !== "number" || unit.managementFee !== amount) {
          console.log("Invalid unit type or management fee:", { unitType, amount });
          return NextResponse.json({ success: false, message: "Invalid unit type or management fee" }, { status: 400 });
        }

        // M-Pesa STK Push
        const mpesaResponse = await axios.post(
          "https://api.umspay.com/v1/payments/stk-push",
          {
            api_key: process.env.UMS_PAY_API_KEY,
            email: process.env.UMS_PAY_EMAIL,
            phone_number: user.phone,
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

        // Update user's payment status and wallet balance
        const updateResult = await db.collection<User>("users").findOneAndUpdate(
          { _id: new ObjectId(userId) },
          {
            $set: { paymentStatus: "active", updatedAt: new Date().toISOString() },
            $inc: { walletBalance: amount },
          },
          { returnDocument: "after" }
        );

        const updatedUser = (updateResult as { value?: User }).value;

        if (!updatedUser) {
          console.log("Failed to update user:", userId);
          return NextResponse.json({ success: false, message: "Failed to update user" }, { status: 500 });
        }

        // Record payment
        const payment: Payment = {
          userId,
          role: "propertyOwner",
          amount,
          propertyId,
          unitType,
          paymentDate: new Date().toISOString(),
          transactionId: mpesaResponse.data.transaction_id,
          status: "completed",
        };

        await db.collection<Payment>("payments").insertOne(payment);
        console.log("Payment recorded:", payment);

        // Record wallet transaction
        const walletTransaction: WalletTransaction = {
          userId,
          type: "credit",
          amount,
          createdAt: new Date().toISOString(),
          description: `Management fee payment for ${property.name} - ${unitType}`,
        };
        await db.collection<WalletTransaction>("walletTransactions").insertOne(walletTransaction);
        console.log("Wallet transaction recorded:", walletTransaction);

        return NextResponse.json({
          success: true,
          message: "Payment processed successfully",
          user: {
            paymentStatus: updatedUser.paymentStatus,
            walletBalance: updatedUser.walletBalance,
          },
        }, { status: 200 });
      } else {
        // Tenant Payment Logic
        const tenant = await db.collection<Tenant>("tenants").findOne({ _id: new ObjectId(userId) });
        if (!tenant) {
          console.log("Tenant not found:", userId);
          return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
        }

        if (tenant._id.toString() !== userId || role !== "tenant") {
          console.log("Unauthorized access - userId:", userId, "role:", role);
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
          { _id: new ObjectId(userId) },
          {
            $set: {
              paymentStatus: rentPaid >= monthlyRent ? "paid" : "overdue",
              updatedAt: new Date().toISOString(),
            },
            $inc: { walletBalance: walletCredit },
          }
        );

        if (updateResult.matchedCount === 0) {
          console.log("Failed to update tenant:", userId);
          return NextResponse.json({ success: false, message: "Failed to update tenant" }, { status: 500 });
        }

        // Record payment
        const payment: Payment = {
          userId,
          role: "tenant",
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
            userId,
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
      }
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

    const { db, client } = await connectToDatabase();
    try {
      // Check for admin role from cookies
      const cookieRole = req.cookies.get("role")?.value;
      console.log("Cookie role:", cookieRole);

      if (cookieRole === "admin") {
        // Admins can fetch all payments
        const payments = await db.collection<Payment>("payments").find({}).toArray();
        const count = await db.collection<Payment>("payments").countDocuments({});
        console.log(`Found ${payments.length} payments for admin`);

        return NextResponse.json({
          success: true,
          payments: payments.map((payment) => ({
            ...payment,
            _id: payment._id?.toString(),
            userId: payment.userId,
            propertyId: payment.propertyId,
            paymentDate: payment.paymentDate,
            transactionId: payment.transactionId,
            status: payment.status,
          })),
          count,
        }, { status: 200 });
      }

      // Non-admin requests require tenantId, userId, and role
      if (!tenantId || !ObjectId.isValid(tenantId) || !userId || !ObjectId.isValid(userId) || !role || !["tenant", "propertyOwner"].includes(role)) {
        console.log("Invalid parameters for non-admin:", { tenantId, userId, role });
        return NextResponse.json({ success: false, message: "Invalid parameters: tenantId, userId, and role are required for non-admin users" }, { status: 400 });
      }

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

      const payments = await db.collection<Payment>("payments").find({ userId: tenantId, role: "tenant" }).toArray();
      const count = await db.collection<Payment>("payments").countDocuments({ userId: tenantId, role: "tenant" });
      console.log(`Found ${payments.length} payments for tenant:`, tenantId);

      return NextResponse.json({
        success: true,
        payments: payments.map((payment) => ({
          ...payment,
          _id: payment._id?.toString(),
          userId: payment.userId,
          propertyId: payment.propertyId,
          paymentDate: payment.paymentDate,
          transactionId: payment.transactionId,
          status: payment.status,
        })),
        count,
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