import { PDF_TEMPLATE_PUBLIC_PATH } from "@/lib/pdf-template";

let cachedBytes: Uint8Array | null = null;

export async function fetchPdfTemplateBytes(): Promise<Uint8Array> {
  if (cachedBytes) return cachedBytes;
  const res = await fetch(PDF_TEMPLATE_PUBLIC_PATH, { cache: "force-cache" });
  if (!res.ok) throw new Error(`Failed to load PDF template (${res.status})`);
  const buf = await res.arrayBuffer();
  cachedBytes = new Uint8Array(buf);
  return cachedBytes;
}

