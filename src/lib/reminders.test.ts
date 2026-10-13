import { describe, expect, it } from "vitest";
import { buildReminderMessages } from "./reminders";

describe("buildReminderMessages (SMS)", () => {
  it("includes the complete reminder content", () => {
    const { smsMessage } = buildReminderMessages(
      "fiveDaysBefore",
      "Jane Doe",
      "Sorana Property Managers - Riverside Heights Phase 2 (Block C)",
      "A12",
      "May 3, 2026",
      "03 May",
      25000,
      0,
      0,
      25000
    );

    expect(smsMessage).toContain("Ksh");
    expect(smsMessage).toContain("03 May");
    expect(smsMessage).toContain("(A12)");
  });

  it("preserves long property names and the complete reminder footer", () => {
    const { smsMessage } = buildReminderMessages(
      "paymentDate",
      "Jane Doe",
      "A Very Very Very Very Very Very Very Long Property Name That Will Not Fit In A Single SMS",
      "B-1002",
      "May 3, 2026",
      "03 May",
      123456.78,
      0,
      0,
      123456.78
    );

    expect(smsMessage).toContain("Rent reminder:");
    expect(smsMessage).toContain("03 May");
    expect(smsMessage).toContain("(B-1002)");
    expect(smsMessage).toContain("A Very Very Very Very Very Very Very Long Property Name That Will Not Fit In A Single SMS");
    expect(smsMessage).toContain("Pay portal. If paid, ignore.");
  });

  it("keeps the displayed total consistent with a rent penalty included in rent due", () => {
    const { whatsappMessage, smsMessage } = buildReminderMessages(
      "paymentDate",
      "Jane Doe",
      "Riverside Heights",
      "A12",
      "May 3, 2026",
      "03 May",
      10_500,
      1_500,
      0,
      12_000,
    );

    expect(whatsappMessage).toContain("Rent: Ksh 10500.00");
    expect(whatsappMessage).toContain("Utilities: Ksh 1500.00");
    expect(whatsappMessage).toContain("Total: Ksh 12000.00");
    expect(smsMessage).toContain("Ksh 12000");
  });
});

