import { NextRequest, NextResponse } from "next/server";
import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from '@/lib/logger';

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;
// Maximum number of files
const MAX_FILES = 10;
// Allowed file types
const VALID_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
];

function normalizeExtension(file: File): string {
  const byName = file.name.split('.').pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(byName)) return byName;
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  if (file.type === "image/heic") return "heic";
  if (file.type === "image/heif") return "heif";
  return "img";
}

function detectMimeFromSignature(bytes: Uint8Array): string | null {
  if (bytes.length >= 4) {
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return "image/gif";
  }
  if (bytes.length >= 12) {
    const riff = String.fromCharCode(...bytes.slice(0, 4));
    const webp = String.fromCharCode(...bytes.slice(8, 12));
    if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  }
  if (bytes.length >= 12) {
    const boxType = String.fromCharCode(...bytes.slice(4, 8));
    if (boxType === "ftyp") {
      const brand = String.fromCharCode(...bytes.slice(8, 12)).toLowerCase();
      if (brand.includes("heic") || brand.includes("heif") || brand.includes("mif1") || brand.includes("msf1")) {
        return brand.includes("heif") || brand.includes("msf1") ? "image/heif" : "image/heic";
      }
    }
  }
  return null;
}

// Validate file type and size
async function isValidFile(file: File): Promise<{ valid: boolean; error?: string; mimeType?: string }> {
  if (file.size <= 0) {
    return { valid: false, error: `${file.name} is empty` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `${file.name} exceeds 5MB limit` };
  }

  const headerBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const signatureMime = detectMimeFromSignature(headerBytes);
  const declaredMime = file.type || "";
  const mimeType = VALID_FILE_TYPES.includes(declaredMime) ? declaredMime : signatureMime || declaredMime;

  if (!mimeType || !VALID_FILE_TYPES.includes(mimeType)) {
    return { valid: false, error: `${file.name} is not a supported image format` };
  }

  return { valid: true, mimeType };
}

export async function POST(request: NextRequest) {
  try {
    logger.debug('Handling POST request to /api/upload', {
      method: request.method,
      url: request.url,
    });

    // Authentication check (owners + team members + admins)
    const role = request.cookies.get("role")?.value;
    const userId = request.cookies.get("userId")?.value;
    const ownerId = request.cookies.get("ownerId")?.value || userId;
    if (!role || !userId || !ownerId) {
      logger.warn("Unauthorized access attempt", { role, userId });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    if (!["propertyOwner", "teamMember", "admin"].includes(role)) {
      logger.warn("Unauthorized access attempt (invalid role)", { role, userId });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    }

    // Extra guard: property owners should never present a different ownerId.
    if (role === "propertyOwner" && ownerId !== userId) {
      logger.warn("Unauthorized access attempt (owner mismatch)", { role, userId, ownerId });
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 403 });
    }

    // CSRF token validation
    const csrfToken = request.headers.get("x-csrf-token") || request.headers.get("X-CSRF-Token");
    if (!validateCsrfToken(request, csrfToken)) {
      logger.warn('Invalid CSRF token', { userId, csrfToken });
      return buildInvalidCsrfResponse(request);
    }

    // Parse form data
    const formData = await request.formData();
    const formDataEntries = Array.from(formData.entries());
    logger.debug('FormData entries received:', {
      userId,
      entries: formDataEntries.map(([key, value]) => ({ key, name: value instanceof File ? value.name : value })),
    });

    const files = formData.getAll('images') as File[];
    logger.debug('Files extracted from FormData:', {
      userId,
      fileCount: files.length,
      fileNames: files.map((file) => file.name),
    });

    // Validate number of files
    if (files.length === 0) {
      logger.warn('No files uploaded', { userId });
      return NextResponse.json(
        { success: false, message: 'No files uploaded' },
        { status: 400 }
      );
    }
    if (files.length > MAX_FILES) {
      logger.warn('Too many files uploaded', { userId, fileCount: files.length });
      return NextResponse.json(
        { success: false, message: `Maximum ${MAX_FILES} images allowed` },
        { status: 400 }
      );
    }

    // Validate files
    const validationErrors: string[] = [];
    const validFiles: File[] = [];

    for (const file of files) {
      const validation = await isValidFile(file);
      if (!validation.valid) {
        validationErrors.push(validation.error!);
      } else {
        validFiles.push(file);
      }
    }

    if (validationErrors.length > 0) {
      logger.warn('Invalid files detected', { userId, errors: validationErrors });
      return NextResponse.json(
        { success: false, message: validationErrors.join('; ') },
        { status: 400 }
      );
    }

    // Upload files to Vercel Blob
    const urls: string[] = [];
    const failedFiles: Array<{ name: string; error: string }> = [];
    for (const file of validFiles) {
      const extension = normalizeExtension(file);
      const fileName = `uploads/${ownerId}/${uuidv4()}.${extension}`;

      try {
        const { url } = await put(fileName, file, {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        urls.push(url);
        logger.debug('File uploaded successfully', { userId, fileName, url });
      } catch (error) {
        logger.error('Failed to upload file to Vercel Blob', {
          userId,
          fileName,
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Continue with the next file instead of throwing
        failedFiles.push({
          name: file.name,
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    }

    if (urls.length === 0) {
      logger.error('No files were uploaded successfully', { userId, errors: validationErrors });
      return NextResponse.json(
        {
          success: false,
          message: validationErrors.join('; ') || failedFiles[0]?.error || 'Failed to upload any files',
          failedFiles,
        },
        { status: 500 }
      );
    }

    logger.info('Images uploaded successfully', { userId, fileCount: urls.length, urls });
    return NextResponse.json(
      {
        success: true,
        urls,
        failedFiles,
        message: failedFiles.length > 0 ? `Uploaded ${urls.length} image(s) with ${failedFiles.length} failure(s).` : undefined,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const userId = request.cookies.get("userId")?.value || "unknown";
    logger.error('Error uploading images', {
      userId,
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}

// Configure runtime for Vercel serverless
export const runtime = "edge";
export const maxDuration = 30;
