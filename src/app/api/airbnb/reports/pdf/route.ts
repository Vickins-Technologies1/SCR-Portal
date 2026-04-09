import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { calculateAdr, calculateOccupancyRate, calculateRevpar } from "@/lib/airbnb-metrics";
import { endOfDay, getMonthRange, parseDate, startOfDay } from "@/lib/airbnb-utils";
import { calculateAirbnbTaxes } from "@/lib/airbnb-taxes";
import { sumAirbnbRevenueForRange } from "@/lib/airbnb-billing";
import { ObjectId } from "mongodb";
import * as fs from "fs";
import * as path from "path";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const startDateParam = searchParams.get("startDate");
  const endDateParam = searchParams.get("endDate");

  const isValidDate = (value?: string | null) => {
    if (!value) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(value);
    return !Number.isNaN(parsed.getTime());
  };

  let start = getMonthRange().start;
  let end = getMonthRange().end;

  if (isValidDate(startDateParam)) {
    start = startOfDay(new Date(startDateParam!));
  }
  if (isValidDate(endDateParam)) {
    end = endOfDay(new Date(endDateParam!));
  }
  if (start > end) {
    const fallback = getMonthRange();
    start = fallback.start;
    end = fallback.end;
  }

  const days = Math.max(1, Math.ceil((end.getTime() - start.getTime() + 1) / (1000 * 60 * 60 * 24)));

  const bookings = await db
    .collection("airbnbBookings")
    .find({ ownerId, status: { $ne: "cancelled" } })
    .toArray();
  const directPayments = await db
    .collection("payments")
    .find({ ownerId, type: "AirbnbDirect", status: "completed" })
    .toArray();
  const payouts = await db
    .collection("airbnbPayouts")
    .find({ ownerId, status: "paid" })
    .toArray();

  const revenueSources = {
    directPayments: directPayments.map((payment: any) => ({
      paymentDate: payment.paymentDate,
      createdAt: payment.createdAt,
      amount: payment.amount,
    })),
    payouts: payouts.map((payout: any) => ({
      createdAt: payout.createdAt,
      period: payout.period,
      amount: payout.amount,
    })),
  };

  const listings = await db.collection("airbnbListings").find({ ownerId }).toArray();

  const monthlyBookings = bookings.filter((booking) => {
    const checkIn = parseDate(booking.checkIn);
    return checkIn && checkIn >= start && checkIn <= end;
  });

  const revenueBreakdown = sumAirbnbRevenueForRange(revenueSources, start, end);
  const revenue = revenueBreakdown.total;
  const bookedNights = monthlyBookings.reduce((sum, booking) => sum + Number(booking.nights || 0), 0);
  const availableNights = listings.reduce((sum, listing) => sum + (listing.units || 1) * days, 0);

  const summary = {
    occupancyRate: calculateOccupancyRate(bookedNights, availableNights),
    revenue: Math.round(revenue),
    adr: calculateAdr(revenue, bookedNights),
    revpar: calculateRevpar(revenue, availableNights),
  };

  const taxes = calculateAirbnbTaxes(summary.revenue);

  const owner = ObjectId.isValid(ownerId)
    ? await db.collection("propertyOwners").findOne({ _id: new ObjectId(ownerId) })
    : null;

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595, 842]);
  const { width, height } = page.getSize();

  const bgPath = path.join(process.cwd(), "public", "bg.png");
  if (fs.existsSync(bgPath)) {
    const bgImage = await pdfDoc.embedPng(fs.readFileSync(bgPath));
    page.drawImage(bgImage, { x: 0, y: 0, width, height });
  }

  page.drawText("Airbnb Tax & Performance Report", {
    x: 50,
    y: height - 120,
    size: 20,
    font: bold,
    color: rgb(0.01, 0.16, 0.29),
  });
  page.drawText(
    `Period: ${start.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" })} - ${end.toLocaleDateString("en-KE", { month: "short", day: "numeric", year: "numeric" })}`,
    { x: 50, y: height - 145, size: 10, font }
  );
  page.drawText(`Owner: ${owner?.name || "Property Owner"}`, { x: 50, y: height - 160, size: 9, font });

  let y = height - 210;
  const drawMetric = (label: string, value: string) => {
    page.drawText(label, { x: 50, y, size: 10, font: bold });
    page.drawText(value, { x: 260, y, size: 10, font });
    y -= 18;
  };

  drawMetric("Revenue (KES)", `Ksh ${summary.revenue.toLocaleString("en-KE")}`);
  drawMetric("Occupancy Rate", `${summary.occupancyRate}%`);
  drawMetric("ADR", `Ksh ${summary.adr.toLocaleString("en-KE")}`);
  drawMetric("RevPAR", `Ksh ${summary.revpar.toLocaleString("en-KE")}`);

  y -= 12;
  page.drawText("Tax Breakdown", { x: 50, y, size: 12, font: bold, color: rgb(0.01, 0.16, 0.29) });
  y -= 18;

  const drawTax = (label: string, rate: number, amount: number) => {
    page.drawText(`${label} (${(rate * 100).toFixed(1)}%)`, { x: 50, y, size: 10, font });
    page.drawText(`Ksh ${Math.round(amount).toLocaleString("en-KE")}`, { x: 260, y, size: 10, font: bold });
    y -= 16;
  };

  drawTax("Tourism Levy", taxes.rates.tourismLevy, taxes.tourismLevy);
  drawTax("VAT", taxes.rates.vat, taxes.vat);
  drawTax("Digital Service Tax", taxes.rates.dst, taxes.dst);

  y -= 10;
  page.drawText(`Total Tax Estimate: Ksh ${Math.round(taxes.total).toLocaleString("en-KE")}`, {
    x: 50,
    y,
    size: 11,
    font: bold,
  });

  const pdfBytes = await pdfDoc.save();
  return NextResponse.json({
    success: true,
    pdf: Buffer.from(pdfBytes).toString("base64"),
    filename: `airbnb-tax-report-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}.pdf`,
  });
}
