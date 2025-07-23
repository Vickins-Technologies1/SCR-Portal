import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db } from "mongodb";

export async function GET(request: NextRequest) {
  // Check for admin authorization
  const role = request.cookies.get("role")?.value;
  console.log("GET /api/admin/users - Cookie role:", role);

  if (role !== "admin") {
    console.log("Unauthorized access - role:", role);
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const roleParam = searchParams.get("role");
    console.log("GET /api/admin/users - Query params:", { role: roleParam });

    const { db }: { db: Db } = await connectToDatabase();
    console.log("Connected to MongoDB database: rentaldb");

    // Define query based on role parameter
    const query = roleParam ? { role: roleParam } : { role: { $in: ["propertyOwner", "tenant", "admin"] } };

    // Fetch property owners and admins from propertyOwners collection
    const propertyOwners = await db
      .collection("propertyOwners")
      .find({ role: { $in: ["propertyOwner", "admin"] } })
      .project({ _id: 1, email: 1, role: 1, name: 1, phone: 1, createdAt: 1 })
      .toArray();

    // Fetch tenants from tenants collection
    const tenants = await db
      .collection("tenants")
      .find({ role: "tenant" })
      .project({ _id: 1, email: 1, role: 1, name: 1, phone: 1, createdAt: 1 })
      .toArray();

    // Filter users based on role parameter
    let users = [];
    if (!roleParam || roleParam === "propertyOwner") {
      users.push(...propertyOwners.filter((u) => u.role === "propertyOwner"));
    }
    if (!roleParam || roleParam === "admin") {
      users.push(...propertyOwners.filter((u) => u.role === "admin"));
    }
    if (!roleParam || roleParam === "tenant") {
      users.push(...tenants);
    }

    // Calculate counts
    const counts = {
      propertyOwners: await db.collection("propertyOwners").countDocuments({ role: "propertyOwner" }),
      tenants: await db.collection("tenants").countDocuments({ role: "tenant" }),
      admins: await db.collection("propertyOwners").countDocuments({ role: "admin" }),
    };

    console.log("Fetched users:", {
      propertyOwners: propertyOwners.length,
      tenants: tenants.length,
      totalUsers: users.length,
      counts,
    });

    return NextResponse.json({
      success: true,
      users: users.map((u) => ({
        ...u,
        _id: u._id.toString(),
        createdAt: u.createdAt ? (u.createdAt instanceof Date ? u.createdAt.toISOString() : String(u.createdAt)) : "Not set",
      })),
      counts,
    });
  } catch (error: any) {
    console.error("Users fetch error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}