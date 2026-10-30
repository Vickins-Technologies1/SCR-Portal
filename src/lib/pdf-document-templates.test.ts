import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateAirbnbBookingReceiptPdf } from "./airbnb-booking-receipt-pdf";
import { generateAirbnbOwnerStatementPdf } from "./airbnb-owner-statement-pdf";
import { generateAirbnbTaxReportPdf } from "./airbnb-tax-report-pdf";
import { generateTenantPaymentReportPdf } from "./tenant-payment-report-pdf";
import { generateTenantPaymentReceiptPdf } from "./tenant-payment-receipt-pdf";

describe("PDF document templates", () => {
  it("renders a verified tenant payment receipt with long contact and reference fields", async () => {
    const bytes = await generateTenantPaymentReceiptPdf({
      payment: {
        receiptNumber: "PAYMENT-202610-123456789",
        amount: 15500,
        propertyId: "507f1f77bcf86cd799439011",
        paymentDate: "2026-10-12T10:30:00.000Z",
        transactionId: "TX-VERY-LONG-REFERENCE-12345678901234567890",
        status: "completed",
        type: "Rent",
        phoneNumber: "+254700000000",
        mpesaCode: "QWERTY123456",
        method: "M-Pesa",
        remainingBalance: 5000,
      },
      tenant: { name: "Sam Tenant Longlastname", email: "sam@example.com", phone: "+254700000000", houseNumber: "Block C Unit 802" },
      property: { name: "The Incredibly Longly Named Residential Property", address: Array(80).fill("Long address section with estate and road details").join(" ") },
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getTitle()).toContain("Payment Receipt");
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("distinguishes an unverified Airbnb booking amount from completed payments", async () => {
    const bytes = await generateAirbnbBookingReceiptPdf({
      reference: "AB-202610-ROOM-1",
      propertyName: "Coast Apartment",
      guestName: "Guest Name",
      guestPhone: "+254700000000",
      checkIn: "2026-10-12",
      checkOut: "2026-10-16",
      nights: 4,
      bookingAmount: 24000,
      verifiedAmount: 0,
      paymentMethod: "M-Pesa",
      paymentReference: "",
      hostName: "Host Name",
      hostPhone: "+254700000001",
      paymentDate: null,
      bookingStatus: "Confirmed",
      payoutStatus: "Pending verification",
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toContain("Booking Payment Receipt");
  });

  it("renders the Airbnb tax and performance summary on a branded page", async () => {
    const bytes = await generateAirbnbTaxReportPdf({
      start: new Date("2026-10-01T00:00:00.000Z"),
      end: new Date("2026-10-31T23:59:59.000Z"),
      ownerName: "Airbnb Owner",
      summary: { occupancyRate: 74.5, revenue: 450000, adr: 18200, revpar: 13500 },
      taxes: { tourismLevy: 9000, vat: 72000, dst: 13500, total: 94500, rates: { tourismLevy: 0.02, vat: 0.16, dst: 0.03 } },
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getTitle()).toBe("Airbnb Tax and Performance Report");
  });

  it("repeats table headers and paginates the Airbnb owner statement", async () => {
    const rows = Array.from({ length: 135 }, (_, index) => ({
      propertyName: `Listing ${index + 1} - A long property name with additional neighborhood details`,
      period: `Oct ${String((index % 28) + 1).padStart(2, "0")}, 2026`,
      amount: 15000 + index,
      status: "paid",
      method: "M-Pesa",
      mpesaCode: `MPESA-REFERENCE-${index}-LONG-123456789`,
    }));
    const bytes = await generateAirbnbOwnerStatementPdf({ periodLabel: "October 2026", ownerName: "Owner Name", ownerEmail: "owner@example.com", totalAmount: rows.reduce((sum, row) => sum + row.amount, 0), rows });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pdf.getTitle()).toContain("Airbnb Owner Statement");
  });

  it("repeats table headers and paginates the tenant payment report", async () => {
    const logoBytes = new Uint8Array(readFileSync(path.join(process.cwd(), "public", "brand", "my-accurate-rent-favicon.png")));
    const statements = Array.from({ length: 120 }, (_, index) => ({
      _id: String(index + 1),
      amount: 2500 + index,
      paymentDate: "2026-10-01",
      status: "completed",
      type: index % 5 === 0 ? "Deposit" : "Rent",
      reference: `REFERENCE-${index}-EXTREMELY-LONG-REFERENCE-1234567890`,
    }));
    const bytes = await generateTenantPaymentReportPdf({
      report: { generatedAt: "2026-10-31 10:00", paymentStatusLabel: "Active", overdueBalance: 0, totalPaid: 400000, collectionRate: 100, walletBalance: 0, leaseRange: "Jan 2026 - Dec 2026", insights: ["All rent is up to date."], statements },
      tenant: { name: "Tenant Name" },
      property: { name: "A long-term residential estate" },
      unitNumbers: "A101, A102",
      logoBytes,
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pdf.getTitle()).toContain("Tenant Payment Report");
  });
});
