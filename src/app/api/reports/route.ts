import { NextResponse } from "next/server";
import { Db, MongoClient, ObjectId } from "mongodb";
import { cookies } from "next/headers";

// Database connection
const connectToDatabase = async (): Promise<Db> => {
  const client = new MongoClient(process.env.MONGODB_URI || "mongodb://localhost:27017");
  await client.connect();
  return client.db("rentaldb");
};

// TypeScript Interfaces
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
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

// GET /api/reports
export async function GET(): Promise<NextResponse<ApiResponse<Report[]>>> {
  try {
    // Authenticate user from cookies
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;

    if (!userId || role !== "propertyOwner") {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    // Connect to MongoDB
    const db = await connectToDatabase();
    const paymentsCollection = db.collection<Payment>("payments");
    const tenantsCollection = db.collection<Tenant>("tenants");
    const propertiesCollection = db.collection<Property>("properties");

    // Fetch payments for the property owner
    const payments = await paymentsCollection
      .find({ ownerId: userId })
      .sort({ date: -1 })
      .toArray();

    // Fetch tenants and properties for mapping
    const tenantIds = [...new Set(payments.map((p) => p.tenantId))];
    const propertyIds = [...new Set(payments.map((p) => p.propertyId))];

    const tenants = await tenantsCollection
      .find({ _id: { $in: tenantIds.map((id) => new ObjectId(id)) }, ownerId: userId })
      .toArray();

    const properties = await propertiesCollection
      .find({ _id: { $in: propertyIds.map((id) => new ObjectId(id)) }, ownerId: userId })
      .toArray();

    // Create maps for efficient lookup
    const tenantMap = new Map<string, Tenant>(tenants.map((t) => [t._id.toString(), t]));
    const propertyMap = new Map<string, Property>(properties.map((p) => [p._id.toString(), p]));

    // Generate reports
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
    }));

    return NextResponse.json(
      { success: true, data: reports },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching reports:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch reports" },
      { status: 500 }
    );
  }
}