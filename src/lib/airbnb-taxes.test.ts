import { describe, expect, it } from "vitest";
import { calculateAirbnbTaxes } from "./airbnb-taxes";

describe("airbnb tax calculations", () => {
  it("calculates tourism levy, VAT, and DST totals", () => {
    const originalTourism = process.env.AIRBNB_TOURISM_LEVY_RATE;
    const originalVat = process.env.AIRBNB_VAT_RATE;
    const originalDst = process.env.AIRBNB_DST_RATE;
    process.env.AIRBNB_TOURISM_LEVY_RATE = "0.02";
    process.env.AIRBNB_VAT_RATE = "0.16";
    process.env.AIRBNB_DST_RATE = "0.015";

    const taxes = calculateAirbnbTaxes(100000);
    expect(Math.round(taxes.tourismLevy)).toBe(2000);
    expect(Math.round(taxes.vat)).toBe(16000);
    expect(Math.round(taxes.dst)).toBe(1500);
    expect(Math.round(taxes.total)).toBe(19500);

    process.env.AIRBNB_TOURISM_LEVY_RATE = originalTourism;
    process.env.AIRBNB_VAT_RATE = originalVat;
    process.env.AIRBNB_DST_RATE = originalDst;
  });
});
