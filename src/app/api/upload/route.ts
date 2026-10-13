import { NextRequest, NextResponse } from "next/server";
import { del, head, put } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';
import { v4 as uuidv4 } from 'uuid';
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import { detectMarketplaceImageType, getMarketplaceUploadTokenOptions, MARKETPLACE_IMAGE_MAX_SIZE, marketplaceImageExtension } from "@/lib/marketplace-image";
import logger from '@/lib/logger';

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;
// Maximum number of files
const MAX_FILES = 10;
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

// Validate file type and size
async function isValidFile(file: File): Promise<{ valid: boolean; error?: string; mimeType?: string }> {
  if (file.size <= 0) {
    return { valid: false, error: `${file.name} is empty` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `${file.name} exceeds 5MB limit` };
  }

  const headerBytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const signatureMime = detectMarketplaceImageType(headerBytes);
  const declaredMime = file.type || "";
  if (!signatureMime || (declaredMime && declaredMime !== signatureMime) || !marketplaceImageExtension(file.name, signatureMime)) {
    return { valid: false, error: `${file.name} is not a supported image format` };
  }

  return { valid: true, mimeType: signatureMime };
}

function getUploadIdentity(request: NextRequest) {
  const role = request.cookies.get("role")?.value;
  const userId = request.cookies.get("userId")?.value;
  const ownerId = role === "propertyOwner" ? userId : request.cookies.get("ownerId")?.value;
  if (!userId || !ownerId || !["propertyOwner", "teamMember", "admin"].includes(role || "")) return null;
  if (role === "propertyOwner" && ownerId !== userId) return null;
  return { role, userId, ownerId };
}

async function handleDirectBlobUpload(request: NextRequest) {
  const body = await request.json();
  const isCompletionCallback = body?.type === "blob.upload-completed";
  const identity = isCompletionCallback ? null : getUploadIdentity(request);

  if (!isCompletionCallback && !identity) {
    return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!isCompletionCallback) {
    const csrfToken = request.headers.get("x-csrf-token");
    if (!validateCsrfToken(request, csrfToken)) return buildInvalidCsrfResponse(request);
  }

  const result = await handleUpload({
    request,
    body,
    onBeforeGenerateToken: async (pathname, _clientPayload, multipart) => {
      if (!identity) throw new Error("Unauthorized");
      return getMarketplaceUploadTokenOptions(pathname, identity, multipart);
    },
    onUploadCompleted: async ({ blob, tokenPayload }) => {
      const parsed = tokenPayload ? JSON.parse(tokenPayload) as { ownerId?: string; userId?: string } : {};
      const expectedPrefix = `uploads/${parsed.ownerId}/`;
      try {
        if (!parsed.ownerId || !blob.pathname.startsWith(expectedPrefix)) {
          throw new Error("Uploaded image does not match its authorized upload token");
        }
        const response = await fetch(blob.url);
        if (!response.ok) throw new Error("Could not verify uploaded image");
        const bytes = new Uint8Array(await response.arrayBuffer());
        const actualType = detectMarketplaceImageType(bytes.slice(0, 16));
        if (!actualType || bytes.length > MARKETPLACE_IMAGE_MAX_SIZE || actualType !== blob.contentType || !marketplaceImageExtension(blob.pathname, actualType)) {
          throw new Error("Uploaded file is not a supported image");
        }
      } catch (error) {
        await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN });
        throw error;
      }
    },
  });
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  try {
    // Vercel's function request-size ceiling makes proxied multipart uploads unreliable.
    // Marketplace uploads use Blob client tokens so file bytes go directly to Blob.
    if (request.headers.get("content-type")?.includes("application/json")) {
      return await handleDirectBlobUpload(request);
    }
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

export async function DELETE(request: NextRequest) {
  try {
    const identity = getUploadIdentity(request);
    if (!identity) return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 });
    if (!validateCsrfToken(request, request.headers.get("x-csrf-token"))) return buildInvalidCsrfResponse(request);

    const { pathname } = await request.json();
    if (typeof pathname !== "string" || pathname.includes("..")) return NextResponse.json({ success: false, message: "Invalid image path" }, { status: 400 });
    if (!pathname.startsWith(`uploads/${identity.ownerId}/`)) {
      return NextResponse.json({ success: false, message: "Image does not belong to this owner" }, { status: 403 });
    }
    const blob = await head(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
    if (blob.pathname !== pathname) return NextResponse.json({ success: false, message: "Image does not belong to this owner" }, { status: 403 });
    await del(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to delete an unreferenced marketplace image", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ success: false, message: "Could not remove uploaded image" }, { status: 500 });
  }
}

// Configure runtime for Vercel serverless
export const runtime = "nodejs";
export const maxDuration = 30;
