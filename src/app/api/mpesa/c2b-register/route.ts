import { NextRequest, NextResponse } from "next/server";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

export async function POST(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;

  if (!userId || role !== "propertyOwner") {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const csrfToken = request.headers.get("x-csrf-token");
  if (!csrfToken || !(await validateCsrfToken(request, csrfToken))) {
    return buildInvalidCsrfResponse(request, "Invalid or missing CSRF token");
  }

  return NextResponse.json(
    { success: false, message: "C2B is not enabled for this Sorana launch; use Daraja STK Push." },
    { status: 501 },
  );
}
