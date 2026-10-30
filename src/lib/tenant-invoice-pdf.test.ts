import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateTenantInvoicePdf } from "./tenant-invoice-pdf";

describe("generateTenantInvoicePdf", () => {
  it("renders a branded invoice with payment and prior balance details", async () => {
    const result = await generateTenantInvoicePdf({
      invoiceNumber: "RENT-202610-ABC123", issueDate: "2026-10-01", dueDate: "2026-10-05", billingPeriod: "2026-10",
      tenantName: "Sam Tenant", tenantEmail: "sam@example.com", propertyName: "Accurate House", unitLabel: "A1",
      items: [{ description: "Monthly rent", quantity: 1, unitAmount: 25_000, amount: 25_000 }],
      totalMinor: 25_000, amountPaidMinor: 5_000, previousOutstandingMinor: 2_000,
      creditsAndAdjustmentsMinor: -500, brandName: "My Rentals", brandColor: "#184a72", paymentInstructions: "M-Pesa Paybill: 123456\nAccount/reference: RENT-202610-ABC123",
    });

    expect(result.invoiceNumber).toBe("RENT-202610-ABC123");
    expect(result.pdfBytes.byteLength).toBeGreaterThan(1000);
  });

  it("repeats the invoice table header and paginates long invoices and payment instructions", async () => {
    const items = Array.from({ length: 84 }, (_, index) => ({
      description: `Utility charge ${index + 1} for the east wing, water supply and shared services at the property`,
      quantity: 1,
      unitAmount: 1250,
      amount: 1250,
    }));
    const instructions = Array.from({ length: 55 }, (_, index) => `Payment channel ${index + 1}: M-Pesa Paybill 123456, account reference TENANT-2026-10`).join("\n");
    const result = await generateTenantInvoicePdf({
      invoiceNumber: "RENT-202610-LONG-NAME", issueDate: "2026-10-01", dueDate: "2026-10-05", billingPeriod: "2026-10", status: "partially_paid",
      tenantName: "Alexandria Longlastname-ExtremelyLongUnitName", tenantEmail: "tenant@example.com", propertyName: "An Incredibly Long Property Name With Multiple Sections", propertyAddress: "123 Very Long Road, Building North, Suite 1402, Nairobi, Kenya",
      unitLabel: "North Tower Unit 1402", items, totalMinor: 105000, amountPaidMinor: 15000,
      landlordName: "A Property Manager With a Very Long Name", landlordEmail: "manager@example.com", landlordPhone: "+254700000000",
      paymentInstructions: instructions,
    });
    const pdf = await PDFDocument.load(result.pdfBytes);
    expect(pdf.getPageCount()).toBeGreaterThan(3);
    expect(pdf.getTitle()).toContain("Rent Invoice");
  });
});
