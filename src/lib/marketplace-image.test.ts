import { describe, expect, it } from "vitest";
import { detectMarketplaceImageType, MARKETPLACE_IMAGE_MAX_SIZE, marketplaceImageExtension } from "./marketplace-image";

describe("marketplace image validation", () => {
  it.each([
    [[0xff, 0xd8, 0xff, 0], "image/jpeg"],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "image/png"],
    [[0x47, 0x49, 0x46, 0x38], "image/gif"],
    [[0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], "image/webp"],
    [[0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63], "image/heic"],
  ])("detects actual signatures", (bytes, expected) => {
    expect(detectMarketplaceImageType(new Uint8Array(bytes))).toBe(expected);
  });

  it("rejects unknown signatures and mismatched extensions", () => {
    expect(detectMarketplaceImageType(new Uint8Array([1, 2, 3]))).toBeNull();
    expect(marketplaceImageExtension("fake.png", "image/jpeg")).toBeNull();
    expect(marketplaceImageExtension("actual.jpeg", "image/jpeg")).toBe("jpeg");
  });

  it("retains the existing 5 MB per-image limit", () => {
    expect(MARKETPLACE_IMAGE_MAX_SIZE).toBe(5 * 1024 * 1024);
  });
});
