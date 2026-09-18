import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getReferralSettings, isValidReferralCode } from "@/lib/referrals";

export async function GET(request: NextRequest, context: { params: Promise<{ referralCode: string }> }) {
  const { referralCode } = await context.params;
  const code = decodeURIComponent(referralCode || "").trim().toUpperCase();
  const destination = new URL("/sign-up", request.url);
  if (!isValidReferralCode(code)) return NextResponse.redirect(destination);

  const { db } = await connectToDatabase();
  const referrer = await db.collection("propertyOwners").findOne({ referralCode: code }, { projection: { _id: 1 } });
  if (!referrer) return NextResponse.redirect(destination);

  const settings = await getReferralSettings(db);
  const response = NextResponse.redirect(destination);
  response.cookies.set("sorana_referral_code", code, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: settings.attributionDays * 24 * 60 * 60,
    path: "/",
  });

  await db.collection("referralClicks").insertOne({
    referralCode: code,
    referrerUserId: referrer._id.toString(),
    ipHash: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    userAgent: request.headers.get("user-agent") || undefined,
    createdAt: new Date(),
  });
  return response;
}
