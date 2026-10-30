import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveTenantContext } from "@/lib/impersonation";
import { resolveAirbnbBookingReference, resolveAirbnbPaymentMethod } from "@/lib/airbnb-booking-workflow";
import { generateAirbnbBookingReceiptPdf } from "@/lib/airbnb-booking-receipt-pdf";

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

  const pdfBytes = await generateAirbnbBookingReceiptPdf({
    reference: bookingReference,
    propertyName: String(booking.listingName || "Airbnb Stay"),
    guestName: String(booking.guestName || tenant.name || "Guest"),
    guestPhone: String(booking.guestPhone || ""),
    checkIn: booking.checkIn,
    checkOut: booking.checkOut,
    nights: Number(booking.nights || 0),
    bookingAmount: Number(booking.amountPaid ?? booking.total ?? 0),
    verifiedAmount: Number(latestPayment?.amount || 0),
    paymentMethod,
    paymentReference: String(latestPayment?.mpesaCode || latestPayment?.reference || ""),
    hostName: String(owner?.name || "Host"),
    hostPhone: String(owner?.phone || ""),
    hostEmail: String(owner?.email || ""),
    paymentDate: latestPayment?.paymentDate || null,
    bookingStatus: booking.status === "confirmed" ? "Confirmed" : String(booking.status || "Pending"),
    payoutStatus: String(booking.payoutStatus || "Payment verification pending"),
  });
  const fileName = `airbnb-receipt-${bookingReference}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=\"${fileName}\"`,
    },
  });
}
