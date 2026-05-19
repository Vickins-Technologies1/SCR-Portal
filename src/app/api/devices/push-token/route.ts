import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";
import { z } from "zod";

const BodySchema = z.object({
  token: z.string().trim().min(8),
  platform: z.enum(["ios", "android", "web"]).optional(),
});

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const csrfToken = request.headers.get("x-csrf-token") || request.headers.get("X-CSRF-Token");

  if (!userId || !ObjectId.isValid(userId) || !role) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  // Proxy enforces CSRF too, but validate here for defense-in-depth.
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const json = await request.json().catch(() => null);
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid payload" }, { status: 400 });
  }

  try {
    const { db } = await connectToDatabase();
    const nowIso = new Date().toISOString();
    const platform = parsed.data.platform || "web";

    await db.collection("devicePushTokens").updateOne(
      { token: parsed.data.token },
      {
        $set: {
          token: parsed.data.token,
          platform,
          userId,
          role,
          updatedAt: nowIso,
          lastSeenAt: nowIso,
        },
        $setOnInsert: {
          createdAt: nowIso,
        },
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    logger.error("POST /api/devices/push-token failed", {
      message: error instanceof Error ? error.message : String(error),
      userId,
      role,
    });
    return NextResponse.json({ success: false, message: "Server error" }, { status: 500 });
  }
}

