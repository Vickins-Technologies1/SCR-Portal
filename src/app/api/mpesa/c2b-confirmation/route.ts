// src/app/api/mpesa/c2b-confirmation/route.ts
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const ConfirmationSchema = z.object({
  TransID: z.string().optional(),
  TransAmount: z.string().optional(),
  MSISDN: z.string().optional(),
  BillRefNumber: z.string().optional(),
});

export async function POST(request: NextRequest) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid JSON" }, { status: 400 });
  }

  const parsed = ConfirmationSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Invalid payload" }, { status: 400 });
  }

  return NextResponse.json({ ResultCode: 1, ResultDesc: "C2B is not enabled for this Sorana launch" }, { status: 501 });
}
