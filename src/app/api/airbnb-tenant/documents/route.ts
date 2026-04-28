import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { v4 as uuidv4 } from "uuid";
import { put } from "@vercel/blob";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { resolveTenantContext } from "@/lib/impersonation";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const VALID_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"] as const;

const DocumentTypeSchema = z.enum(["id_card", "driver_license", "passport"]);

function isValidFile(file: File): { valid: boolean; error?: string } {
  if (!VALID_FILE_TYPES.includes(file.type as any)) {
    return { valid: false, error: `${file.name} is not a valid file (PNG, JPG, or PDF only)` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `${file.name} exceeds 10MB limit` };
  }
  return { valid: true };
}

async function resolveAirbnbGuestTenant(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const isImpersonating = request.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = request.cookies.get("impersonatingTenantId")?.value;

  const { db } = await connectToDatabase();
  const tenantContext = await resolveTenantContext({
    db,
    userId,
    role,
    isImpersonating,
    impersonatingTenantId,
  });

  if (!tenantContext || !ObjectId.isValid(tenantContext.tenantId)) {
    return { db, tenantContext: null, tenant: null, bookingId: null };
  }

  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantContext.tenantId) });
  if (!tenant) {
    return { db, tenantContext, tenant: null, bookingId: null };
  }

  if (tenant.accountType !== "airbnb_guest" || !tenant.airbnbBookingId) {
    return { db, tenantContext, tenant, bookingId: null };
  }

  if (tenant.expiresAt) {
    const expiresAt = new Date(String(tenant.expiresAt));
    if (!Number.isNaN(expiresAt.getTime()) && Date.now() > expiresAt.getTime()) {
      return { db, tenantContext, tenant: null, bookingId: null };
    }
  }

  return { db, tenantContext, tenant, bookingId: String(tenant.airbnbBookingId) };
}

export async function GET(request: NextRequest) {
  const resolved = await resolveAirbnbGuestTenant(request);
  if (!resolved.tenantContext || !resolved.tenant || !resolved.bookingId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const ownerId = String(resolved.tenant.ownerId || "");
  const tenantId = String(resolved.tenantContext.tenantId);
  const bookingId = resolved.bookingId;

  const docs = await resolved.db
    .collection("airbnbGuestDocuments")
    .find({ ownerId, bookingId, tenantId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(25)
    .toArray();

  return NextResponse.json({
    success: true,
    documents: docs.map((doc) => ({
      id: doc._id?.toString?.() || "",
      documentType: doc.documentType,
      fileName: doc.fileName,
      fileType: doc.fileType,
      url: doc.url,
      createdAt: doc.createdAt,
    })),
  });
}

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token") || request.headers.get("X-CSRF-Token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbGuestTenant(request);
  if (!resolved.tenantContext || !resolved.tenant || !resolved.bookingId) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const rawType = String(formData.get("documentType") || "").trim();
  const parsedType = DocumentTypeSchema.safeParse(rawType);
  if (!parsedType.success) {
    return NextResponse.json({ success: false, message: "Invalid document type" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "Missing file" }, { status: 400 });
  }

  const validation = isValidFile(file);
  if (!validation.valid) {
    return NextResponse.json({ success: false, message: validation.error || "Invalid file" }, { status: 400 });
  }

  const ownerId = String(resolved.tenant.ownerId || "");
  const tenantId = String(resolved.tenantContext.tenantId);
  const bookingId = resolved.bookingId;
  const nowIso = new Date().toISOString();

  const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
  const pathname = `airbnb-guest-docs/${ownerId}/${bookingId}/${uuidv4()}.${extension}`;
  const blob = await put(pathname, file, {
    access: "public",
    token: process.env.BLOB_READ_WRITE_TOKEN,
    addRandomSuffix: true,
  });

  const insert = {
    ownerId,
    bookingId,
    tenantId,
    documentType: parsedType.data,
    fileName: file.name,
    fileType: file.type,
    url: blob.url,
    downloadUrl: blob.downloadUrl,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const result = await resolved.db.collection("airbnbGuestDocuments").insertOne(insert);

  return NextResponse.json(
    {
      success: true,
      document: {
        id: result.insertedId.toString(),
        documentType: insert.documentType,
        fileName: insert.fileName,
        fileType: insert.fileType,
        url: insert.url,
        createdAt: insert.createdAt,
      },
    },
    { status: 201 }
  );
}
