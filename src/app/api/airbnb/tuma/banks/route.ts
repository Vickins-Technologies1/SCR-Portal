import { NextRequest, NextResponse } from "next/server";
import { fetchTumaBanks } from "@/lib/tuma";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveAirbnbOwner(request, null);
    if (resolved.response) return resolved.response;

    const banks = await fetchTumaBanks();
    const sorted = banks
      .filter((bank) => bank.id && bank.name)
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ success: true, banks: sorted });
  } catch (error) {
    console.error("GET /api/airbnb/tuma/banks error:", error);
    return NextResponse.json({ success: false, message: "Failed to load banks" }, { status: 500 });
  }
}

