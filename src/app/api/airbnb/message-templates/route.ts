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
  const templates = await db
    .collection("airbnbMessageTemplates")
    .find({ ownerId })
    .sort({ createdAt: -1 })
    .toArray();

  return NextResponse.json({
    success: true,
    templates: templates.map((template) => ({
      id: template.externalId || template._id?.toString?.() || "",
      title: template.title,
      body: template.body,
      language: template.language,
    })),
  });
}

const TemplateSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(2),
  body: z.string().trim().min(5),
  language: z.enum(["en", "sw"]).optional(),
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

  const parsed = TemplateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid template payload" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  const now = new Date().toISOString();
  const externalId = `tmpl-${new ObjectId().toString()}`;
  const templateDoc = {
    ownerId,
    externalId,
    title: parsed.data.title,
    body: parsed.data.body,
    language: parsed.data.language || "en",
    createdAt: now,
    updatedAt: now,
  };

  await db.collection("airbnbMessageTemplates").insertOne(templateDoc);

  return NextResponse.json({
    success: true,
    template: {
      id: externalId,
      title: templateDoc.title,
      body: templateDoc.body,
      language: templateDoc.language,
    },
  });
}

export async function PUT(request: NextRequest) {
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

  const parsed = TemplateSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.id) {
    return NextResponse.json({ success: false, message: "Invalid template payload" }, { status: 400 });
  }

  const templateId = parsed.data.id;
  const filter = ObjectId.isValid(templateId)
    ? { _id: new ObjectId(templateId), ownerId }
    : { externalId: templateId, ownerId };

  const { db } = await connectToDatabase();
  const result = await db.collection("airbnbMessageTemplates").findOneAndUpdate(
    filter,
    {
      $set: {
        title: parsed.data.title,
        body: parsed.data.body,
        language: parsed.data.language || "en",
        updatedAt: new Date().toISOString(),
      },
    },
    { returnDocument: "after" }
  );

  const updated = result?.value;
  if (!updated) {
    return NextResponse.json({ success: false, message: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    template: {
      id: updated.externalId || updated._id?.toString?.() || "",
      title: updated.title,
      body: updated.body,
      language: updated.language,
    },
  });
}

const DeleteSchema = z.object({ id: z.string().min(1) });

export async function DELETE(request: NextRequest) {
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

  const parsed = DeleteSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid delete payload" }, { status: 400 });
  }

  const templateId = parsed.data.id;
  const filter = ObjectId.isValid(templateId)
    ? { _id: new ObjectId(templateId), ownerId }
    : { externalId: templateId, ownerId };

  const { db } = await connectToDatabase();
  const result = await db.collection("airbnbMessageTemplates").deleteOne(filter);

  if (!result.deletedCount) {
    return NextResponse.json({ success: false, message: "Template not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
