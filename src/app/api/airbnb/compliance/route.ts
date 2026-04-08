import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const compliance = await db
    .collection("airbnbCompliance")
    .find({ ownerId })
    .sort({ ktraExpiry: 1 })
    .toArray();

  return NextResponse.json({
    success: true,
    compliance: compliance.map((item) => ({
      propertyId: item.externalId || item._id?.toString?.() || "",
      propertyName: item.propertyName,
      ktraLicense: item.ktraLicense,
      ktraExpiry: item.ktraExpiry,
      countyPermitExpiry: item.countyPermitExpiry,
      nemaExpiry: item.nemaExpiry,
      status: item.status,
      nextAction: item.nextAction,
    })),
  });
}

const DocumentSchema = z.object({
  propertyId: z.string().min(1),
  propertyName: z.string().optional(),
  documentType: z.string().trim().min(2),
  url: z.string().url(),
});

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = DocumentSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid document payload" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const now = new Date().toISOString();

  await db.collection("airbnbComplianceDocuments").insertOne({
    ownerId,
    propertyId: parsed.data.propertyId,
    propertyName: parsed.data.propertyName,
    documentType: parsed.data.documentType,
    url: parsed.data.url,
    createdAt: now,
  });

  const complianceId = parsed.data.propertyId;
  const filter = ObjectId.isValid(complianceId)
    ? { _id: new ObjectId(complianceId), ownerId }
    : { externalId: complianceId, ownerId };

  await db.collection("airbnbCompliance").updateOne(
    filter,
    { $set: { lastDocumentAt: now, updatedAt: now } }
  );

  return NextResponse.json({ success: true });
}
