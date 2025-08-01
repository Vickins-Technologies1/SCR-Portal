// src/app/api/upload/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { validateCsrfToken } from '@/lib/csrf';
import logger from '@/lib/logger';

// Define the upload directory
const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

// Ensure the upload directory exists
async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (error) {
    logger.error('Failed to create upload directory', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw new Error('Failed to initialize upload directory');
  }
}

// Validate file type and size
function isValidFile(file: File): { valid: boolean; error?: string } {
  const validTypes = ['image/jpeg', 'image/png'];
  const maxSize = 5 * 1024 * 1024; // 5MB

  if (!validTypes.includes(file.type)) {
    return { valid: false, error: `${file.name} is not a valid image (JPEG or PNG only)` };
  }
  if (file.size > maxSize) {
    return { valid: false, error: `${file.name} exceeds 5MB limit` };
  }
  return { valid: true };
}

export async function POST(request: NextRequest) {
  try {
    console.log('Handling POST request to /api/upload');

    // Authentication
    const cookieStore = await cookies();
    const role = cookieStore.get('role')?.value;
    const userId = cookieStore.get('userId')?.value;

    if (!role || role !== 'propertyOwner' || !userId) {
      logger.error('Unauthorized or invalid userId', { role, userId });
      return NextResponse.json(
        { success: false, message: 'Unauthorized or invalid user ID' },
        { status: 401 }
      );
    }

    // Extract CSRF token from headers
    const csrfToken = request.headers.get('X-CSRF-Token');

    // Verify CSRF token
    if (!validateCsrfToken(request, csrfToken)) {
      logger.error('Invalid CSRF token', { userId, csrfToken });
      return NextResponse.json(
        { success: false, message: 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    // Parse form data
    const formData = await request.formData();
    const files = formData.getAll('image0') as File[];

    // Validate number of files
    if (files.length === 0) {
      logger.error('No files uploaded');
      return NextResponse.json(
        { success: false, message: 'No files uploaded' },
        { status: 400 }
      );
    }
    if (files.length > 5) {
      logger.error('Too many files uploaded', { fileCount: files.length });
      return NextResponse.json(
        { success: false, message: 'Maximum 5 images allowed' },
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
      logger.error('Invalid files detected', { errors: validationErrors });
      return NextResponse.json(
        { success: false, message: validationErrors.join('; ') },
        { status: 400 }
      );
    }

    // Ensure upload directory exists
    await ensureUploadDir();

    // Process and save files
    const urls: string[] = [];
    for (const file of validFiles) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const fileName = `${uuidv4()}.${extension}`;
      const filePath = path.join(UPLOAD_DIR, fileName);
      const fileBuffer = Buffer.from(await file.arrayBuffer());

      try {
        await fs.writeFile(filePath, fileBuffer);
        urls.push(`/uploads/${fileName}`);
      } catch (error) {
        logger.error('Failed to save file', {
          fileName,
          message: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        throw new Error(`Failed to save file: ${fileName}`);
      }
    }

    logger.debug('Images uploaded successfully', { userId, fileCount: urls.length, urls });
    return NextResponse.json(
      {
        success: true,
        urls,
      },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error('Error uploading images', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}