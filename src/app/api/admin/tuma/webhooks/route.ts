import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Db } from "mongodb";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request, "admin:webhooks:view");
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || 50)));

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const webhooks = await db
      .collection("tumaWebhooks")
      .find({})
      .sort({ receivedAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json(
      {
        success: true,
        count: webhooks.length,
        webhooks: webhooks.map((hook: any) => ({
          _id: hook._id.toString(),
          receivedAt: hook.receivedAt || null,
          merchantRequestId: hook.merchantRequestId || "",
          checkoutRequestId: hook.checkoutRequestId || "",
          paymentGatewayId: hook.paymentGatewayId || "",
          status: hook.status || "",
          resultCode: hook.resultCode ?? null,
          resultDesc: hook.resultDesc || "",
          reference: hook.reference || "",
          amount: hook.amount ?? null,
          phoneNumber: hook.phoneNumber || "",
          timestamp: hook.timestamp || "",
          paymentId: hook.paymentId ? String(hook.paymentId) : "",
          paymentStatus: hook.paymentStatus || "",
          paymentMatched: hook.paymentMatched ?? null,
          rawBody: hook.rawBody || "",
        })),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: "Failed to load Tuma webhooks" },
      { status: 500 }
    );
  }
}
