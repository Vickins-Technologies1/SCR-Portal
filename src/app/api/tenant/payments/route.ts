import { NextRequest, NextResponse } from "next/server";
import { MongoClient, ObjectId } from "mongodb";
import axios from "axios";

const connectToDatabase = async () => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  await client.connect();
  const db = client.db("rentaldb");
  return { db, client };
};

// Define interface for the request body
interface PaymentRequestBody {
  tenantId: string;
  propertyId: string;
  type: string;
  amount: number;
  phoneNumber: string;
  csrfToken: string;
}

export async function GET(req: NextRequest) {
  console.log("[GET] Handler invoked - Path: /api/tenant/payments, TenantId:", req.nextUrl.searchParams.get("tenantId"));
  
  let client: MongoClient | null = null;
  try {
    const tenantId = req.nextUrl.searchParams.get("tenantId");
    if (!tenantId || !ObjectId.isValid(tenantId)) {
      console.error("[GET] Invalid tenant ID:", tenantId);
      return NextResponse.json({ success: false, message: "Invalid tenant ID" }, { status: 400 });
    }

    const { db, client: dbClient } = await connectToDatabase();
    client = dbClient;

    const payments = await db
      .collection("payments")
      .find({ tenantId })
      .sort({ paymentDate: -1 })
      .toArray();

    client.close();

    console.log("[GET] Payments fetched successfully for tenantId:", tenantId);
    return NextResponse.json({
      success: true,
      payments: payments.map(p => ({
        ...p,
        _id: p._id.toString(),
        propertyId: p.propertyId.toString(),
        paymentDate: p.paymentDate?.toString(),
      })),
    });
  } catch (error) {
    if (client) client.close();
    console.error("[GET] /api/tenant/payments error:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, message: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let client: MongoClient | null = null;
  let body: PaymentRequestBody | null = null;
  try {
    body = await req.json();

    if (!body) {
      throw new Error("Invalid or missing request body");
    }

    const { tenantId, propertyId, type, amount, phoneNumber, csrfToken } = body;

    if (!tenantId || !ObjectId.isValid(tenantId)) throw new Error("Invalid tenantId");
    if (!propertyId || !ObjectId.isValid(propertyId)) throw new Error("Invalid propertyId");
    if (!["Rent", "Utility"].includes(type)) throw new Error("Invalid payment type");
    if (!/^(\+254|254)7\d{8}$/.test(formatPhoneNumber(phoneNumber))) throw new Error("Invalid phone number format");
    if (!csrfToken) throw new Error("Missing CSRF token");

    const storedCsrfToken = req.cookies.get("csrf-token")?.value;
    if (!storedCsrfToken || storedCsrfToken !== csrfToken) {
      return NextResponse.json({ success: false, message: "Invalid CSRF token" }, { status: 403 });
    }

    const { db, client: dbClient } = await connectToDatabase();
    client = dbClient;

    const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId) });
    if (!tenant) throw new Error("Tenant not found");

    const property = await db.collection("properties").findOne({ _id: new ObjectId(propertyId) });
    if (!property) throw new Error("Property not found");

    if (!property.propertyOwnerId || !ObjectId.isValid(property.propertyOwnerId)) {
      console.error("[POST] Invalid or missing propertyOwnerId for property:", { propertyId, propertyOwnerId: property.propertyOwnerId });
      throw new Error("Invalid or missing property owner ID");
    }

    const owner = await db.collection("propertyOwners").findOne({ _id: new ObjectId(property.propertyOwnerId) });
    if (!owner) {
      console.error("[POST] Owner not found for propertyOwnerId:", property.propertyOwnerId);
      throw new Error("Owner not found for the specified property");
    }

    const paymentSettings = await db.collection("paymentSettings").findOne({ 
      ownerId: new ObjectId(property.propertyOwnerId) 
    });
    
    if (!paymentSettings?.umsPayEnabled || !paymentSettings?.umsPayApiKey || !paymentSettings?.umsPayEmail) {
      console.error("[POST] Payment settings incomplete for ownerId:", property.propertyOwnerId, { paymentSettings });
      throw new Error("Payment settings not configured or UMS Pay not enabled for owner");
    }

    const mpesaRes = await axios.post(
      "https://api.umspay.com/v1/payments/stk-push",
      {
        api_key: paymentSettings.umsPayApiKey,
        email: paymentSettings.umsPayEmail,
        phone_number: formatPhoneNumber(phoneNumber),
        amount,
      },
      { headers: { "Content-Type": "application/json" } }
    );

    if (mpesaRes.data.status !== "success") throw new Error("Payment initiation failed");

    const statusRes = await axios.get(
      `https://api.umspay.com/v1/payments/status?transaction_id=${mpesaRes.data.transaction_id}`,
      { headers: { Authorization: `Bearer ${paymentSettings.umsPayApiKey}` } }
    );

    if (statusRes.data.status !== "completed") throw new Error("Payment not completed");

    const payment = {
      tenantId: tenantId,
      propertyId: propertyId,
      amount,
      phoneNumber: formatPhoneNumber(phoneNumber),
      paymentDate: new Date().toISOString(),
      transactionId: mpesaRes.data.transaction_id,
      status: "completed",
      type,
    };

    await db.collection("payments").insertOne({
      ...payment,
      propertyId: new ObjectId(propertyId),
    });

    const update: any = {
      $set: {
        updatedAt: new Date().toISOString(),
      },
    };

    if (type === "Rent") {
      update.$set.paymentStatus = amount >= tenant.price ? "paid" : "overdue";
    }

    await db.collection("tenants").updateOne({ _id: new ObjectId(tenantId) }, update);

    client.close();
    return NextResponse.json({ success: true, message: `${type} payment recorded successfully` });
  } catch (error: any) {
    if (client) client.close();
    console.error("[POST] /api/tenant/payments error:", {
      message: error.message,
      stack: error.stack,
      requestBody: body || "Failed to parse request body",
    });
    return NextResponse.json({ success: false, message: error.message || "Server error" }, { status: 500 });
  }
}

function formatPhoneNumber(phone: string): string {
  const cleaned = phone.trim().replace(/^0/, "254").replace(/^\+/, "");
  return cleaned.startsWith("254") ? cleaned : `254${cleaned}`;
}