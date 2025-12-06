import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { put } from '@vercel/blob';
import { v4 as uuidv4 } from 'uuid';
import { validateCsrfToken } from '@/lib/csrf';
import logger from '@/lib/logger';

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;
// Maximum number of files
const MAX_FILES = 10;
// Allowed file types
const VALID_FILE_TYPES = ['image/jpeg', 'image/png'];

// Validate file type and size
function isValidFile(file: File): { valid: boolean; error?: string } {
  if (!VALID_FILE_TYPES.includes(file.type)) {
    return { valid: false, error: `${file.name} is not a valid image (JPEG or PNG only)` };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `${file.name} exceeds 5MB limit` };
  }
  return { valid: true };
}

export async function POST(request: NextRequest) {
  try {
    logger.debug('Handling POST request to /api/upload', {
      method: request.method,
      url: request.url,
    });

    // Authentication check
    const cookieStore = await cookies();
    const role = cookieStore.get('role')?.value;
    const userId = cookieStore.get('userId')?.value;

    if (!role || role !== 'propertyOwner' || !userId) {
      logger.warn('Unauthorized access attempt', { role, userId });
      return NextResponse.json(
        { success: false, message: 'Unauthorized or invalid user ID' },
        { status: 401 }
      );
    }

    // CSRF token validation
    const csrfToken = request.headers.get('X-CSRF-Token');
    if (!validateCsrfToken(request, csrfToken)) {
      logger.warn('Invalid CSRF token', { userId, csrfToken });
      return NextResponse.json(
        { success: false, message: 'Invalid CSRF token' },
        { status: 403 }
      );
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
      const validation = isValidFile(file);
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
    for (const file of validFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const fileName = `uploads/${userId}/${uuidv4()}.${extension}`;
      const fileContent = Buffer.from(await file.arrayBuffer());

      try {
        const { url } = await put(fileName, fileContent, {
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
        validationErrors.push(`Failed to upload file: ${fileName}`);
      }
    }

    if (urls.length === 0) {
      logger.error('No files were uploaded successfully', { userId, errors: validationErrors });
      return NextResponse.json(
        { success: false, message: validationErrors.join('; ') || 'Failed to upload any files' },
        { status: 500 }
      );
    }

    logger.info('Images uploaded successfully', { userId, fileCount: urls.length, urls });
    return NextResponse.json(
      {
        success: true,
        urls,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    const cookieStore = await cookies();
    const userId = cookieStore.get('userId')?.value || 'unknown';
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
export const runtime = 'edge';
export const maxDuration = 30;