import { NextRequest, NextResponse } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";

// Database connection
const connectToDatabase = async (): Promise<Db> => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  await client.connect();
  return client.db("rentaldb");
};

// Interfaces
interface Payment {
  _id: ObjectId;
  tenantId: string;
  propertyId: string;
  amount: number;
  date: string;
  status: string;
  ownerId: string;
}

interface Tenant {
  _id: ObjectId;
  name: string;
  propertyId: string;
  status: string;
  paymentStatus: string;
  ownerId: string;
}

interface Property {
  _id: ObjectId;
  name: string;
  ownerId: string;
}

interface Report {
  _id: string;
  propertyId: string;
  propertyName: string;
  tenantId: string;
  tenantName: string;
  revenue: number;
  date: string;
  status: string;
  ownerId: string;
  tenantPaymentStatus: string; // New field for tenant payment status
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// GET /api/reports
export async function GET(request: NextRequest): Promise<NextResponse<ApiResponse<Report[]>>> {
  const startTime = Date.now();
  try {
    // Read cookies from client request
    const userId = request.cookies.get("userId")?.value;
    const role = request.cookies.get("role")?.value;
    console.log("GET /api/reports - Cookies - userId:", userId, "role:", role);

    if (!userId || !ObjectId.isValid(userId)) {
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    if (role !== "propertyOwner") {
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner." },
        { status: 401 }
      );
    }

    // Get query params (propertyId, startDate, endDate)
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (propertyId && !ObjectId.isValid(propertyId)) {
      return NextResponse.json(
        { success: false, message: "Invalid property ID" },
        { status: 400 }
      );
    }

    // Validate date range
    if ((startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) || (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate))) {
      return NextResponse.json(
        { success: false, message: "Invalid date format. Use YYYY-MM-DD." },
        { status: 400 }
      );
    }

    // DB Connection
    const db = await connectToDatabase();
    const paymentsCollection = db.collection<Payment>("payments");
    const tenantsCollection = db.collection<Tenant>("tenants");
    const propertiesCollection = db.collection<Property>("properties");

    const paymentQuery: { ownerId: string; propertyId?: string; date?: { $gte?: string; $lte?: string } } = { ownerId: userId };
    if (propertyId) paymentQuery.propertyId = propertyId;
    if (startDate || endDate) {
      paymentQuery.date = {};
      if (startDate) paymentQuery.date.$gte = startDate;
      if (endDate) paymentQuery.date.$lte = endDate;
    }

    const payments = await paymentsCollection
      .find(paymentQuery)
      .sort({ date: -1 })
      .toArray();

    const tenantIds = [...new Set(payments.map((p) => p.tenantId))];
    const propertyIds = [...new Set(payments.map((p) => p.propertyId))];

    const tenants = await tenantsCollection
      .find({ _id: { $in: tenantIds.map((id) => new ObjectId(id)) }, ownerId: userId })
      .toArray();

    const properties = await propertiesCollection
      .find({ _id: { $in: propertyIds.map((id) => new ObjectId(id)) }, ownerId: userId })
      .toArray();

    const tenantMap = new Map(tenants.map((t) => [t._id.toString(), t]));
    const propertyMap = new Map(properties.map((p) => [p._id.toString(), p]));

    const reports: Report[] = payments.map((payment) => ({
      _id: payment._id.toString(),
      propertyId: payment.propertyId,
      propertyName: propertyMap.get(payment.propertyId)?.name || "Unassigned",
      tenantId: payment.tenantId,
      tenantName: tenantMap.get(payment.tenantId)?.name || "Unknown",
      revenue: payment.amount,
      date: payment.date,
      status: payment.status,
      ownerId: payment.ownerId,
      tenantPaymentStatus: tenantMap.get(payment.tenantId)?.paymentStatus || "Unknown",
    }));

    console.log("GET /api/reports - Completed in", Date.now() - startTime, "ms");

    return NextResponse.json({ success: true, data: reports }, { status: 200 });
  } catch (error: unknown) {
    console.error("Error fetching reports:", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return NextResponse.json(
      { success: false, message: "Failed to fetch reports" },
      { status: 500 }
    );
  }
}