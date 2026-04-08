import { describe, expect, it } from "vitest";
import {
  buildAirbnbPaymentReference,
  parseAirbnbPaymentReference,
  normalizeAirbnbPaymentStatus,
} from "./airbnb-payments";

describe("airbnb payments helpers", () => {
  it("builds and parses booking payment references", () => {
    const reference = buildAirbnbPaymentReference("bk-901");
    expect(reference).toBe("ABNB-bk-901");
    expect(parseAirbnbPaymentReference(reference)).toBe("bk-901");
  });

  it("normalizes payment statuses for reporting", () => {
    expect(normalizeAirbnbPaymentStatus("completed")).toBe("paid");
    expect(normalizeAirbnbPaymentStatus("failed")).toBe("failed");
    expect(normalizeAirbnbPaymentStatus("pending")).toBe("pending");
  });
});
