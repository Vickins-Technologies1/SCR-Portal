import "server-only";

import * as fs from "fs";
import * as path from "path";

let cachedBytes: Uint8Array | null = null;

export function getPdfTemplateBytes(): Uint8Array {
  if (cachedBytes) return cachedBytes;
  const filePath = path.join(process.cwd(), "public", "brand", "my-accurate-rent-logo.jpg");
  cachedBytes = new Uint8Array(fs.readFileSync(filePath));
  return cachedBytes;
}
