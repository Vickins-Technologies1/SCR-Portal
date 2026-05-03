import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";

type SaleListingStatus = "published" | "draft" | "sold";

const normalizeText = (value: unknown, maxLength: number) => {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
};

const normalizeStringArray = (value: unknown, maxItems = 50, maxItemLength = 140): string[] => {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = normalizeText(item, maxItemLength);
    if (!normalized) continue;
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return Array.from(new Set(out));
};

const normalizeStatus = (value: unknown): SaleListingStatus => {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "published" || raw === "draft" || raw === "sold") return raw;
  return "draft";
};

const toNumberOrUndefined = (value: unknown) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
};

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();

    const rows = await db
      .collection("marketplaceSaleListings")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const listings = rows.map((row) => ({
      _id: row._id?.toString?.() || "",
      name: row.name || "",
      address: row.address || "",
      description: row.description || "",
      propertyType: row.propertyType || "",
      bedrooms: toNumberOrUndefined(row.bedrooms),
      bathrooms: toNumberOrUndefined(row.bathrooms),
      interiorSizeSqft: toNumberOrUndefined(row.interiorSizeSqft),
      lotSizeSqft: toNumberOrUndefined(row.lotSizeSqft),
      yearBuilt: toNumberOrUndefined(row.yearBuilt),
      price: Number(row.price || 0),
      currency: row.currency || "Ksh",
      amenities: Array.isArray(row.amenities) ? row.amenities : [],
      images: Array.isArray(row.images) ? row.images : [],
      status: normalizeStatus(row.status),
      isFeatured: !!row.isFeatured,
      contactEmail: row.contactEmail || "",
      contactPhone: row.contactPhone || "",
      createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt || "",
      updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt || "",
    }));

    return NextResponse.json({ success: true, listings }, { status: 200 });
  } catch (error) {
    console.error("Admin sale listings GET error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  if (role !== "admin") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();

    const name = normalizeText(payload.name, 120);
    const address = normalizeText(payload.address, 200);
    const description = typeof payload.description === "string" ? payload.description.trim().slice(0, 5000) : "";
    const propertyType = normalizeText(payload.propertyType, 60);
    const currency = normalizeText(payload.currency, 10) || "Ksh";
    const price = Number(payload.price || 0);
    const status = normalizeStatus(payload.status);
    const isFeatured = Boolean(payload.isFeatured);
    const contactEmail = normalizeText(payload.contactEmail, 120);
    const contactPhone = normalizeText(payload.contactPhone, 40);

    const bedrooms = toNumberOrUndefined(payload.bedrooms);
    const bathrooms = toNumberOrUndefined(payload.bathrooms);
    const interiorSizeSqft = toNumberOrUndefined(payload.interiorSizeSqft);
    const lotSizeSqft = toNumberOrUndefined(payload.lotSizeSqft);
    const yearBuilt = toNumberOrUndefined(payload.yearBuilt);

    const images = normalizeStringArray(payload.images, 40, 500);
    const amenities = normalizeStringArray(payload.amenities, 60, 80);

    if (!name || name.length < 3) {
      return NextResponse.json({ success: false, message: "Name is required." }, { status: 400 });
    }

    if (!address || address.length < 3) {
      return NextResponse.json({ success: false, message: "Address is required." }, { status: 400 });
    }

    if (!Number.isFinite(price) || price < 0) {
      return NextResponse.json({ success: false, message: "Price must be a valid number." }, { status: 400 });
    }

    const now = new Date();
    const adminUserId = request.cookies.get("userId")?.value || null;

    const doc: any = {
      name,
      address,
      description,
      propertyType,
      bedrooms,
      bathrooms,
      interiorSizeSqft,
      lotSizeSqft,
      yearBuilt,
      price,
      currency,
      amenities,
      images,
      status,
      isFeatured,
      contactEmail: contactEmail || null,
      contactPhone: contactPhone || null,
      createdBy: adminUserId,
      createdAt: now,
      updatedAt: now,
    };

    const { db } = await connectToDatabase();
    const result = await db.collection("marketplaceSaleListings").insertOne(doc);

    return NextResponse.json(
      { success: true, id: result.insertedId.toString() },
      { status: 201 }
    );
  } catch (error) {
    console.error("Admin sale listings POST error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

