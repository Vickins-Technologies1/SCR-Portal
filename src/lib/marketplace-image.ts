export const MARKETPLACE_IMAGE_MAX_SIZE = 5 * 1024 * 1024;
export const MARKETPLACE_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
] as const;

export type MarketplaceImageType = (typeof MARKETPLACE_IMAGE_TYPES)[number];

export function getMarketplaceUploadTokenOptions(
  pathname: string,
  identity: { ownerId: string; userId: string },
  multipart: boolean,
) {
  const prefix = `uploads/${identity.ownerId}/`;
  const filename = pathname.split("/").pop() || "";
  const [id, extension] = filename.split(".");
  const typeByExtension: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", heic: "image/heic", heif: "image/heif",
  };
  if (!pathname.startsWith(prefix) || pathname.includes("..") || !/^[a-f0-9-]{36}$/i.test(id || "") || !typeByExtension[extension || ""]) {
    throw new Error("Invalid image upload path or format");
  }
  if (multipart) throw new Error("Marketplace images must be uploaded one at a time");
  return {
    allowedContentTypes: [typeByExtension[extension]],
    maximumSizeInBytes: MARKETPLACE_IMAGE_MAX_SIZE,
    addRandomSuffix: false,
    tokenPayload: JSON.stringify({ ownerId: identity.ownerId, userId: identity.userId }),
  };
}

export function detectMarketplaceImageType(bytes: Uint8Array): MarketplaceImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return "image/png";
  if (bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "GIF8") return "image/gif";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === "ftyp") {
    const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
    if (["heic", "heix", "hevc", "hevx", "mif1"].includes(brand)) return "image/heic";
    if (["heif", "msf1"].includes(brand)) return "image/heif";
  }
  return null;
}

export function marketplaceImageExtension(name: string, type: string): string | null {
  const extension = name.split(".").pop()?.toLowerCase();
  const expected: Record<MarketplaceImageType, string[]> = {
    "image/jpeg": ["jpg", "jpeg"],
    "image/png": ["png"],
    "image/webp": ["webp"],
    "image/gif": ["gif"],
    "image/heic": ["heic"],
    "image/heif": ["heif"],
  };
  if (!MARKETPLACE_IMAGE_TYPES.includes(type as MarketplaceImageType)) return null;
  return extension && expected[type as MarketplaceImageType].includes(extension) ? extension : null;
}
