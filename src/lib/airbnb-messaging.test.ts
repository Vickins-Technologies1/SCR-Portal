import { describe, expect, it } from "vitest";
import { renderAirbnbTemplate } from "./airbnb-messaging";

describe("airbnb messaging templates", () => {
  it("replaces template variables", () => {
    const rendered = renderAirbnbTemplate("Hello {name}, welcome to {listingName}.", {
      name: "Amina",
      listingName: "Nairobi Loft",
    });
    expect(rendered).toBe("Hello Amina, welcome to Nairobi Loft.");
  });
});
