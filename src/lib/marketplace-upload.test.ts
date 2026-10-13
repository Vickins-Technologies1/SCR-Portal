import { describe, expect, it, vi } from "vitest";
import { uploadMarketplaceFiles } from "./marketplace-upload";

function image(name: string) {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], name, { type: "image/jpeg", lastModified: 1 });
}

describe("marketplace image uploads", () => {
  it("uploads multiple files individually and preserves selection order", async () => {
    const files = [image("front.jpg"), image("kitchen.jpg")];
    const uploadFile = vi.fn(async (file: File) => `https://blob.test/${file.name}`);
    const result = await uploadMarketplaceFiles(files, {}, uploadFile, vi.fn(), vi.fn());

    expect(uploadFile).toHaveBeenCalledTimes(2);
    expect(result).toEqual(["https://blob.test/front.jpg", "https://blob.test/kitchen.jpg"]);
  });

  it("retries failed images without uploading completed images again", async () => {
    const files = [image("front.jpg"), image("kitchen.jpg")];
    const uploaded: Record<string, string> = {};
    const firstUpload = vi.fn(async (file: File) => {
      if (file.name === "kitchen.jpg") throw new Error("connection lost");
      return "https://blob.test/front.jpg";
    });
    await expect(uploadMarketplaceFiles(files, {}, firstUpload, vi.fn(), (key, url) => { uploaded[key] = url; }))
      .rejects.toThrow("completed images are kept");

    const retryUpload = vi.fn(async (file: File) => `https://blob.test/${file.name}`);
    const result = await uploadMarketplaceFiles(files, uploaded, retryUpload, vi.fn(), vi.fn());
    expect(retryUpload).toHaveBeenCalledTimes(1);
    expect(retryUpload).toHaveBeenCalledWith(files[1], expect.any(Function));
    expect(result).toEqual(["https://blob.test/front.jpg", "https://blob.test/kitchen.jpg"]);
  });

  it("reports progress for each file and percentage updates", async () => {
    const file = image("front.jpg");
    const progress = vi.fn();
    await uploadMarketplaceFiles([file], {}, async (_file, report) => {
      report(42.8);
      return "https://blob.test/front.jpg";
    }, progress, vi.fn());
    expect(progress).toHaveBeenNthCalledWith(1, file, 1, 1);
    expect(progress).toHaveBeenNthCalledWith(2, file, 1, 1, 42.8);
  });
});
