import { v4 as uuidv4 } from 'uuid';
import { NextRequest, NextResponse } from 'next/server';

export function generateCsrfToken(): string {
  return uuidv4();
}

export function validateCsrfToken(req: NextRequest, token: string | null): boolean {
  const storedToken = req.cookies.get('csrf-token')?.value;
  const submittedToken = token || req.headers.get('x-csrf-token');
  return !!submittedToken && storedToken === submittedToken;
}
