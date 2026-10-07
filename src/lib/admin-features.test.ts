import { describe, expect, it } from "vitest";
import { getSoftwareLeasingPercentage } from "./billing";

describe("admin configuration safeguards", () => {
  it("uses the persisted leasing percentage when it is valid", async () => {
    const db = { collection: () => ({ findOne: async () => ({ value: 12.5 }) }) } as any;
    await expect(getSoftwareLeasingPercentage(db)).resolves.toBe(12.5);
  });

  it("falls back to the production default for invalid persisted values", async () => {
    const db = { collection: () => ({ findOne: async () => ({ value: 101 }) }) } as any;
    await expect(getSoftwareLeasingPercentage(db)).resolves.toBe(1);
  });
});
