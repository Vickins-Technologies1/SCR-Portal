import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { Db } from "mongodb";

export async function GET(request: NextRequest) {
  const role = request.cookies.get("role")?.value;

  if (!role || role !== "admin") {
    return NextResponse.json(
      { success: false, message: "Unauthorized: Admin access required" },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit") || 50)));

  try {
    const { db }: { db: Db } = await connectToDatabase();

    const webhooks = await db
      .collection("kopokopoWebhooks")
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
          incomingPaymentId: hook.incomingPaymentId || "",
          status: hook.status || "",
          resourceStatus: hook.resourceStatus || "",
          reference: hook.reference || "",
          amount: hook.amount ?? null,
          phoneNumber: hook.phoneNumber || "",
          originationTime: hook.originationTime || "",
          paymentId: hook.paymentId || "",
          paymentStatus: hook.paymentStatus || "",
          paymentMatched: hook.paymentMatched ?? null,
          rawBody: hook.rawBody || "",
        })),
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: "Failed to load KopoKopo webhooks" },
      { status: 500 }
    );
  }
}
