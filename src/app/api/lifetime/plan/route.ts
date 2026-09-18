import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getLifetimePlan, publicLifetimePlan } from "@/lib/lifetime";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const plan = await getLifetimePlan(db);
    return NextResponse.json({ success: true, plan: publicLifetimePlan(plan) });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to load Lifetime package." }, { status: 500 });
  }
}
