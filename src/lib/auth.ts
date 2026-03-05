// lib/auth.ts
'server-only';

import { jwtVerify } from "jose";
import { cookies } from "next/headers";

const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

export async function getCurrentSession() {
  const token = (await cookies()).get("session")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, secret);
    return payload as {
      sub: string;
      email: string;
      role: string;
      ownerId: string | null;
      approved: boolean;
    };
  } catch {
    return null;
  }
}