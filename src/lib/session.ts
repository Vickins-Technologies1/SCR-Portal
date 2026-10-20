import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { AccountTier } from "./tier";

export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days

export type SessionPayload = JWTPayload & {
  sub: string;
  role: string;
  ownerId?: string | null;
  managementType?: "rentals" | "airbnb" | null;
  tier?: AccountTier | null;
  impersonator?: {
    userId: string;
    role: string;
    expiresAt?: number;
  } | null;
  /** Signed owner-authorized tenant subject; never sourced from a browser cookie. */
  impersonatedTenantId?: string | null;
  /** Original session deadline so ending impersonation cannot extend a session. */
  preImpersonationExpiresAt?: number;
};

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(
  payload: SessionPayload,
  maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS
): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secret);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as SessionPayload;
  } catch {
    return null;
  }
}

/** True only when an already verified session belongs to the requested account. */
export function matchesSessionIdentity(
  session: SessionPayload | null,
  userId: string,
  role?: string,
): boolean {
  return Boolean(session && session.sub === userId && (!role || session.role === role));
}

export function getSessionCookieOptions(maxAgeSeconds: number = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: maxAgeSeconds,
    path: "/",
  };
}
