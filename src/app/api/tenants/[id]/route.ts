// src/app/api/tenants/[id]/route.ts
import { NextResponse } from "next/server";
import { connectToDatabase } from "../../../../lib/mongodb";
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import { TenantRequest, UnitType } from "../../../../types/tenant";
import { sendUpdateEmail } from "../../../../lib/email";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const cookies = request.headers.get("cookie");
  const userId = cookies?.match(/userId=([^;]+)/)?.[1];
  const role = cookies?.match(/role=([^;]+)/)?.[1];

  if (!userId || role !== "propertyOwner") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const tenantId = params.id;
  if (!ObjectId.isValid(tenantId)) {
    return NextResponse.json({ success: false, message: "Invalid tenant ID" }, { status: 400 });
  }

  const body: TenantRequest = await request.json();
  const { db } = await connectToDatabase();

  const existingTenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId), ownerId: userId });
  if (!existingTenant) {
    return NextResponse.json({ success: false, message: "Tenant not found" }, { status: 404 });
  }

  const property = await db.collection("properties").findOne({ _id: new ObjectId(body.propertyId), ownerId: userId });
  if (!property) {
    return NextResponse.json({ success: false, message: "Invalid property" }, { status: 400 });
  }

  const unit = property.unitTypes.find((u: UnitType) => u.type === body.unitType);
  if (!unit || unit.price !== body.price || unit.deposit !== body.deposit) {
    return NextResponse.json({ success: false, message: "Invalid unit or price/deposit mismatch" }, { status: 400 });
  }

  const updateData: any = {
    ...body,
    updatedAt: new Date().toISOString(),
  };

  if (body.password) {
    updateData.password = await bcrypt.hash(body.password, 10);
  } else {
    delete updateData.password;
  }

  await db.collection("tenants").updateOne({ _id: new ObjectId(tenantId) }, { $set: updateData });
  await sendUpdateEmail(body.email, body.name, body.email, body.password, body.propertyId, body.houseNumber);

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const cookies = request.headers.get("cookie");
  const userId = cookies?.match(/userId=([^;]+)/)?.[1];
  const role = cookies?.match(/role=([^;]+)/)?.[1];

  if (!userId || role !== "propertyOwner") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const tenantId = params.id;
  if (!ObjectId.isValid(tenantId)) {
    return NextResponse.json({ success: false, message: "Invalid tenant ID" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantId) });

  if (!tenant || tenant.ownerId !== userId) {
    return NextResponse.json({ success: false, message: "Not authorized or not found" }, { status: 403 });
  }

  await db.collection("tenants").deleteOne({ _id: new ObjectId(tenantId) });
  return NextResponse.json({ success: true });
}
