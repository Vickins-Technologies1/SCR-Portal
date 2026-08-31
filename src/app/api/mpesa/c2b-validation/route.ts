import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { findLandlordC2BConnection, normalizeC2BShortcode } from "@/lib/c2b";

const ValidationSchema = z.object({
  TransID: z.string().trim().min(1),
  TransAmount: z.union([z.string(), z.number()]),
  BusinessShortCode: z.union([z.string(), z.number()]),
  BillRefNumber: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const parsed = ValidationSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payload" }, { status: 400 });
    const connection = await findLandlordC2BConnection(normalizeC2BShortcode(parsed.data.BusinessShortCode));
    if (!connection) return NextResponse.json({ ResultCode: 1, ResultDesc: "Unknown business shortcode" });
    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Validation unavailable" }, { status: 500 });
  }
}
