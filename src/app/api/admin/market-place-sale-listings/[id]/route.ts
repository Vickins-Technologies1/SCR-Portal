import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { requireAdmin } from "@/lib/admin-auth";

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request, "admin:marketplace:view");
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const doc = await db.collection("marketplaceSaleListings").findOne({ _id: new ObjectId(id) });
    if (!doc) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    return NextResponse.json(
      {
        success: true,
        listing: {
          _id: doc._id.toString(),
          name: doc.name || "",
          address: doc.address || "",
          description: doc.description || "",
          propertyType: doc.propertyType || "",
          bedrooms: toNumberOrUndefined(doc.bedrooms),
          bathrooms: toNumberOrUndefined(doc.bathrooms),
          interiorSizeSqft: toNumberOrUndefined(doc.interiorSizeSqft),
          lotSizeSqft: toNumberOrUndefined(doc.lotSizeSqft),
          yearBuilt: toNumberOrUndefined(doc.yearBuilt),
          price: Number(doc.price || 0),
          currency: doc.currency || "Ksh",
          amenities: Array.isArray(doc.amenities) ? doc.amenities : [],
          images: Array.isArray(doc.images) ? doc.images : [],
          status: normalizeStatus(doc.status),
          isFeatured: !!doc.isFeatured,
          contactEmail: doc.contactEmail || "",
          contactPhone: doc.contactPhone || "",
          createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt || "",
          updatedAt: doc.updatedAt instanceof Date ? doc.updatedAt.toISOString() : doc.updatedAt || "",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Admin sale listing GET by id error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request, "admin:marketplace:view");
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }

  try {
    const payload = await request.json();

    const update: any = {};
    if ("name" in payload) update.name = normalizeText(payload.name, 120);
    if ("address" in payload) update.address = normalizeText(payload.address, 200);
    if ("description" in payload)
      update.description = typeof payload.description === "string" ? payload.description.trim().slice(0, 5000) : "";
    if ("propertyType" in payload) update.propertyType = normalizeText(payload.propertyType, 60);
    if ("currency" in payload) update.currency = normalizeText(payload.currency, 10) || "Ksh";
    if ("price" in payload) update.price = Number(payload.price || 0);
    if ("status" in payload) update.status = normalizeStatus(payload.status);
    if ("isFeatured" in payload) update.isFeatured = Boolean(payload.isFeatured);
    if ("contactEmail" in payload) update.contactEmail = normalizeText(payload.contactEmail, 120) || null;
    if ("contactPhone" in payload) update.contactPhone = normalizeText(payload.contactPhone, 40) || null;

    if ("bedrooms" in payload) update.bedrooms = toNumberOrUndefined(payload.bedrooms);
    if ("bathrooms" in payload) update.bathrooms = toNumberOrUndefined(payload.bathrooms);
    if ("interiorSizeSqft" in payload) update.interiorSizeSqft = toNumberOrUndefined(payload.interiorSizeSqft);
    if ("lotSizeSqft" in payload) update.lotSizeSqft = toNumberOrUndefined(payload.lotSizeSqft);
    if ("yearBuilt" in payload) update.yearBuilt = toNumberOrUndefined(payload.yearBuilt);

    if ("images" in payload) update.images = normalizeStringArray(payload.images, 40, 500);
    if ("amenities" in payload) update.amenities = normalizeStringArray(payload.amenities, 60, 80);

    if (typeof update.name === "string" && update.name && update.name.length < 3) {
      return NextResponse.json({ success: false, message: "Name is required." }, { status: 400 });
    }

    if (typeof update.address === "string" && update.address && update.address.length < 3) {
      return NextResponse.json({ success: false, message: "Address is required." }, { status: 400 });
    }

    if ("price" in update && (!Number.isFinite(update.price) || update.price < 0)) {
      return NextResponse.json({ success: false, message: "Price must be a valid number." }, { status: 400 });
    }

    update.updatedAt = new Date();

    const { db } = await connectToDatabase();
    const result = await db
      .collection("marketplaceSaleListings")
      .updateOne({ _id: new ObjectId(id) }, { $set: update });

    if (!result.matchedCount) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Admin sale listing PUT error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(request, "admin:marketplace:view");
  if (auth instanceof NextResponse) return auth;

  const { id } = await context.params;
  if (!ObjectId.isValid(id)) {
    return NextResponse.json({ success: false, message: "Invalid id" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const result = await db.collection("marketplaceSaleListings").deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) {
      return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Admin sale listing DELETE error:", error);
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}
