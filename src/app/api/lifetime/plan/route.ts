import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { calculateLifetimePrice, LifetimePricingError, getLifetimePlan, publicLifetimePlan } from "@/lib/lifetime";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const plan = await getLifetimePlan(db);
    return NextResponse.json({ success: true, plan: publicLifetimePlan(plan) });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load Lifetime package." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { db } = await connectToDatabase();
    const quote = await calculateLifetimePrice(db, body?.units);
    return NextResponse.json({ success: true, ...quote });
  } catch (error) {
    if (error instanceof LifetimePricingError) {
      return NextResponse.json({ success: false, code: error.code, message: error.message }, { status: error.code === "INVALID_UNITS" ? 400 : 409 });
    }
    return NextResponse.json({ success: false, message: "Unable to calculate Lifetime pricing." }, { status: 500 });
  }
}
