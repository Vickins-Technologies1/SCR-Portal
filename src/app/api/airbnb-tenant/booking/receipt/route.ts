import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveTenantContext } from "@/lib/impersonation";
import { resolveAirbnbBookingReference, resolveAirbnbPaymentMethod } from "@/lib/airbnb-booking-workflow";

export async function GET(request: NextRequest) {
  const userId = request.cookies.get("userId")?.value;
  const role = request.cookies.get("role")?.value;
  const isImpersonating = request.cookies.get("isImpersonating")?.value === "true";
  const impersonatingTenantId = request.cookies.get("impersonatingTenantId")?.value;

  const { db } = await connectToDatabase();
  const tenantContext = await resolveTenantContext({
    db,
    userId,
    role,
    isImpersonating,
    impersonatingTenantId,
  });

  if (!tenantContext || !ObjectId.isValid(tenantContext.tenantId)) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }

  const tenant = await db.collection("tenants").findOne({ _id: new ObjectId(tenantContext.tenantId) });
  if (!tenant || tenant.accountType !== "airbnb_guest" || !tenant.airbnbBookingId) {
    return NextResponse.json({ success: false, message: "Forbidden" }, { status: 403 });
  }

  const bookingId = String(tenant.airbnbBookingId);
  const booking = await db.collection("airbnbBookings").findOne({ ownerId: tenant.ownerId, externalId: bookingId });
  if (!booking) {
    return NextResponse.json({ success: false, message: "Booking not found" }, { status: 404 });
  }

  const latestPayment = await db.collection("payments").findOne(
    { ownerId: tenant.ownerId, airbnbBookingId: bookingId, status: "completed" },
    { sort: { paymentDate: -1, createdAt: -1 } }
  );

  const owner = await db.collection("propertyOwners").findOne(
    ObjectId.isValid(String(tenant.ownerId)) ? { _id: new ObjectId(String(tenant.ownerId)) } : { email: booking.guestEmail },
    { projection: { name: 1, phone: 1, email: 1 } }
  );

  const bookingReference = resolveAirbnbBookingReference(booking as any);
  const paymentMethod = resolveAirbnbPaymentMethod(latestPayment as any);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const draw = (text: string, x: number, y: number, size = 11, bold = false, color = rgb(0.08, 0.12, 0.2)) => {
    page.drawText(text, {
      x,
      y,
      size,
      font: bold ? boldFont : font,
      color,
    });
  };

  page.drawRectangle({ x: 0, y: 780, width: 595, height: 62, color: rgb(0.07, 0.13, 0.29) });
  draw("Booking Receipt", 40, 800, 22, true, rgb(1, 1, 1));
  draw("Sorana Property Managers", 40, 780, 11, false, rgb(0.93, 0.96, 1));

  const checkIn = booking.checkIn ? new Date(booking.checkIn).toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "—";
  const checkOut = booking.checkOut ? new Date(booking.checkOut).toLocaleDateString("en-KE", { weekday: "short", month: "short", day: "numeric", year: "numeric" }) : "—";
  const paymentDate = latestPayment?.paymentDate
    ? new Date(latestPayment.paymentDate).toLocaleString("en-KE")
    : new Date().toLocaleString("en-KE");

  const details = [
    ["Booking Reference", bookingReference],
    ["Property", String(booking.listingName || "Airbnb Stay")],
    ["Guest", String(booking.guestName || tenant.name || "Guest")],
    ["Check-in", checkIn],
    ["Check-out", checkOut],
    ["Nights", String(booking.nights || 0)],
    ["Amount Paid", `KES ${Number(latestPayment?.amount ?? booking.amountPaid ?? booking.total ?? 0).toLocaleString("en-KE")}`],
    ["Payment Method", paymentMethod],
    ["M-Pesa Ref", String(latestPayment?.mpesaCode || latestPayment?.reference || "—")],
    ["Host", String(owner?.name || "Host")],
    ["Host Contact", String(owner?.phone || booking.guestPhone || "—")],
    ["Payment Date", paymentDate],
  ];

  let y = 730;
  for (const [label, value] of details) {
    draw(`${label}:`, 40, y, 11, true);
    draw(value, 180, y, 11, false, rgb(0.16, 0.16, 0.2));
    y -= 28;
  }

  draw(
    booking.status === "confirmed" && String(booking.payoutStatus || "").toLowerCase() === "paid"
      ? "Status: Booking confirmed"
      : "Status: Payment verification pending",
    40,
    70,
    11,
    true,
    rgb(0.04, 0.43, 0.25)
  );

  const pdfBytes = await pdfDoc.save();
  const fileName = `airbnb-receipt-${bookingReference}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=\"${fileName}\"`,
    },
  });
}
