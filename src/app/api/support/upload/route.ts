import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { put } from "@vercel/blob";
import { v4 as uuidv4 } from "uuid";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";
import logger from "@/lib/logger";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;
const VALID_FILE_TYPES = ["image/jpeg", "image/png", "application/pdf"];

function isValidFile(file: File): { valid: boolean; error?: string } {
  if (!VALID_FILE_TYPES.includes(file.type)) {
    return { valid: false, error: `${file.name} is not a valid file (PNG, JPG, or PDF only)` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `${file.name} exceeds 10MB limit` };
  }
  return { valid: true };
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const role = cookieStore.get("role")?.value;
    const userId = cookieStore.get("userId")?.value;
    const permissionsRaw = cookieStore.get("permissions")?.value;
    const permissions = (() => {
      if (!permissionsRaw) return [] as string[];
      try {
        const parsed = JSON.parse(permissionsRaw);
        return Array.isArray(parsed) ? parsed.filter((p) => typeof p === "string") : [];
      } catch {
        return [] as string[];
      }
    })();

    const isAllowedRole =
      role === "propertyOwner" ||
      role === "admin" ||
      (role === "adminTeamMember" && permissions.includes("admin:support:respond"));

    if (!role || !isAllowedRole || !userId) {
      logger.warn("Unauthorized access attempt", { role, userId });
      return NextResponse.json({ success: false, message: "Unauthorized or invalid user ID" }, { status: 401 });
    }

    const csrfToken = request.headers.get("X-CSRF-Token");
    if (!validateCsrfToken(request, csrfToken)) {
      logger.warn("Invalid CSRF token", { userId, csrfToken });
      return buildInvalidCsrfResponse(request);
    }

    const formData = await request.formData();
    const filesFromImages = formData.getAll("images") as File[];
    const filesFromFiles = formData.getAll("files") as File[];
    const files = [...filesFromImages, ...filesFromFiles];

    if (files.length === 0) {
      return NextResponse.json({ success: false, message: "No files uploaded" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { success: false, message: `Maximum ${MAX_FILES} attachments allowed` },
        { status: 400 }
      );
    }

    const validationErrors: string[] = [];
    const validFiles: File[] = [];

    for (const file of files) {
      const validation = isValidFile(file);
      if (!validation.valid) {
        validationErrors.push(validation.error!);
      } else {
        validFiles.push(file);
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json({ success: false, message: validationErrors.join("; ") }, { status: 400 });
    }

    const uploads: { url: string; name: string; type: string; size: number }[] = [];
    for (const file of validFiles) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "bin";
      const fileName = `support/${userId}/${uuidv4()}.${extension}`;
      const fileContent = Buffer.from(await file.arrayBuffer());

      try {
        const { url } = await put(fileName, fileContent, {
          access: "public",
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        uploads.push({ url, name: file.name, type: file.type, size: file.size });
      } catch (error) {
        logger.error("Failed to upload support file", {
          userId,
          fileName,
          message: error instanceof Error ? error.message : "Unknown error",
        });
        validationErrors.push(`Failed to upload file: ${file.name}`);
      }
    }

    if (uploads.length === 0) {
      return NextResponse.json(
        { success: false, message: validationErrors.join("; ") || "Failed to upload any files" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, uploads }, { status: 200 });
  } catch (error: unknown) {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value || "unknown";
    logger.error("Error uploading support files", {
      userId,
      message: error instanceof Error ? error.message : "Internal server error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

export const runtime = "edge";
export const maxDuration = 30;
