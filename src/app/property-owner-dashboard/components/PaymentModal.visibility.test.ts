import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import PaymentModal from "./PaymentModal";

describe("owner invoice payment modal", () => {
  it("omits provider selectors and destination details while preserving invoice fields", () => {
    const html = renderToStaticMarkup(React.createElement(PaymentModal, {
      isOpen: true,
      onClose: () => {},
      onSuccess: () => {},
      onError: () => {},
      properties: [{
        _id: "property-1",
        name: "Example property",
        address: "Nairobi",
        unitTypes: [],
        createdAt: "2026-01-01",
        ownerId: "owner-1",
        status: "active",
      }],
      userId: "owner-1",
      initialPropertyId: "property-1",
    }));

    expect(html).toContain("Phone Number");
    expect(html).toContain("Amount (KES)");
    expect(html).not.toMatch(/Payment Rail|KopoKopo|Paybill|destination|settlement|provider/i);
  });
});
