import { describe, expect, it } from "vitest";
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
});
