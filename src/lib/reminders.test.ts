import { describe, expect, it } from "vitest";
import { buildReminderMessages } from "./reminders";

describe("buildReminderMessages (SMS)", () => {
  it("includes core info and stays within 160 characters", () => {
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

    expect(smsMessage.length).toBeLessThanOrEqual(160);
    expect(smsMessage).toContain("Ksh");
    expect(smsMessage).toContain("03 May");
    expect(smsMessage).toContain("(A12)");
  });

  it("drops the footer or truncates when the message would exceed 160 characters", () => {
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

    expect(smsMessage.length).toBeLessThanOrEqual(160);
    expect(smsMessage).toContain("Rent reminder:");
    expect(smsMessage).toContain("03 May");
    expect(smsMessage).toContain("(B-1002)");
  });
});

