// src/app/api/admin/properties/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import { Db } from "mongodb";

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db }: { db: Db } = await connectToDatabase();
    const properties = await db.collection("properties").find().toArray();
    const count = await db.collection("properties").countDocuments();
    return NextResponse.json({
      success: true,
      properties: properties.map((p) => ({
        ...p,
        _id: p._id.toString(),
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      count,
    });
  } catch (error: any) {
    console.error("Properties fetch error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch properties" }, { status: 500 });
  }
}