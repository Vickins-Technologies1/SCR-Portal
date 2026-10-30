import { describe, expect, it } from "vitest";
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
});
