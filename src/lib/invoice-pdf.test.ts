import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { generateInvoicePdf } from "./invoice-pdf";

describe("generateInvoicePdf", () => {
  it.each([
    [0, "DUE"],
    [950, "PAID"],
    [500, "PARTIALLY PAID"],
  ] as const)("renders the %s payment state", async (amountPaid, status) => {
    const result = await generateInvoicePdf({
      invoice: {
        reference: `INV-${status.replaceAll(" ", "-")}`,
        billingPlan: "FullManagement",
        amount: 950,
        description: "Monthly property management fee",
        dueDate: "2026-09-30T00:00:00.000Z",
        amountPaid,
      },
      owner: { name: "Anthony Murimi", email: "anthony@example.com", phone: "+254 721 685 286" },
      property: { name: "KARATINA B161", address: "Karatina" },
      now: new Date("2026-09-28T00:00:00.000Z"),
    });

    expect(result.calculation.status).toBe(status);
    expect(result.pdfBytes.byteLength).toBeGreaterThan(1000);
    expect(result.invoiceNumber).toContain("INV-");
  });

  it("renders overdue invoices without failing", async () => {
    const result = await generateInvoicePdf({
      invoice: { reference: "INV-OVERDUE", amount: 950, dueDate: "2026-09-01", amountPaid: 0 },
      owner: {}, property: null, now: new Date("2026-09-28"),
    });
    expect(result.calculation.status).toBe("OVERDUE");
    expect(result.calculation.balanceDue).toBe(950);
  });

  it("paginates long invoices and wraps long charge descriptions", async () => {
    const items = Array.from({ length: 72 }, (_, index) => ({
      description: `Monthly property management and scheduled maintenance charge ${index + 1} for a long-named commercial property`,
      qty: 1,
      rate: 100,
    }));
    const result = await generateInvoicePdf({
      invoice: { reference: "FM-LONG-202610", amount: 7200, items, dueDate: "2026-10-31" },
      owner: { name: "The Most Generous Property Owner With a Long Name", email: "property.manager@example.com" },
      property: { name: "The Very Longly Named Commercial Property and Residential Estate", address: "A long street address with building and area details, Nairobi, Kenya" },
      now: new Date("2026-10-01T00:00:00.000Z"),
    });
    const pdf = await PDFDocument.load(result.pdfBytes);
    expect(pdf.getPageCount()).toBeGreaterThan(2);
    expect(pdf.getTitle()).toContain("Management Invoice");
  });
});
