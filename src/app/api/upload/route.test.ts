import { beforeEach, describe, expect, it, vi } from "vitest";

const { handleUploadMock } = vi.hoisted(() => ({ handleUploadMock: vi.fn() }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: handleUploadMock }));
vi.mock("@vercel/blob", () => ({ put: vi.fn(), del: vi.fn() }));

import { NextRequest } from "next/server";
import { POST } from "./route";
import { getMarketplaceUploadTokenOptions } from "@/lib/marketplace-image";

const ownerId = "507f1f77bcf86cd799439011";

function request(cookies: string, csrf?: string) {
  const headers = new Headers({ "content-type": "application/json", cookie: cookies });
  if (csrf) headers.set("x-csrf-token", csrf);
  return new NextRequest("https://example.test/api/upload", {
    method: "POST",
    headers,
    body: JSON.stringify({ type: "blob.generate-client-token", payload: {} }),
  });
}

describe("marketplace Blob upload authorization", () => {
  beforeEach(() => handleUploadMock.mockReset());

  it("rejects unauthenticated token requests", async () => {
    const response = await POST(request("csrf-token=csrf", "csrf"));
    expect(response.status).toBe(401);
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  it("requires CSRF protection before issuing upload tokens", async () => {
    const response = await POST(request(`role=propertyOwner; userId=${ownerId}; csrf-token=csrf`));
    expect(response.status).toBe(403);
    expect(handleUploadMock).not.toHaveBeenCalled();
  });

  it("constrains token type, size, owner path and upload mode", () => {
    const options = getMarketplaceUploadTokenOptions(
      `uploads/${ownerId}/550e8400-e29b-41d4-a716-446655440000.jpg`,
      { ownerId, userId: ownerId },
      false,
    );
    expect(options).toMatchObject({
      allowedContentTypes: ["image/jpeg"],
      maximumSizeInBytes: 5 * 1024 * 1024,
      addRandomSuffix: false,
      tokenPayload: JSON.stringify({ ownerId, userId: ownerId }),
    });
    expect(() => getMarketplaceUploadTokenOptions("uploads/other/550e8400-e29b-41d4-a716-446655440000.jpg", { ownerId, userId: ownerId }, false)).toThrow("Invalid image upload path or format");
    expect(() => getMarketplaceUploadTokenOptions(`uploads/${ownerId}/550e8400-e29b-41d4-a716-446655440000.jpg`, { ownerId, userId: ownerId }, true)).toThrow("one at a time");
  });
});
