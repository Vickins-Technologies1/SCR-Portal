import { SignJWT, jwtVerify } from "jose";

export type GoogleAuthPortal = "owner" | "tenant" | "admin";
export type GoogleAuthAction = "login" | "signup";
export type GoogleAuthPlatform = "app" | "web";

export const GOOGLE_APP_REDIRECT_URI = "com.soranapropertymanagers.app://auth/google/callback";

export type GoogleAuthState = {
  portal: GoogleAuthPortal;
  action: GoogleAuthAction;
  platform?: GoogleAuthPlatform;
  returnTo?: string;
  managementType?: "rentals" | "airbnb";
  packageTier?: "free" | "one_percent" | "full_management";
  tier?: "free" | "premium";
  tenantPortal?: "rental" | "airbnb";
  nonce?: string;
};

export type GooglePendingProfile = {
  userId: string;
  role: string;
  portal: GoogleAuthPortal;
  action: GoogleAuthAction;
  email: string;
  name: string;
  phoneMissing: boolean;
  returnTo?: string;
  managementType?: "rentals" | "airbnb";
  packageTier?: "free" | "one_percent" | "full_management";
  tier?: "free" | "premium";
  tenantPortal?: "rental" | "airbnb";
  requiresOtpAfterPhone?: boolean;
};

export type GoogleProfile = {
  id: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified?: boolean;
};

export const GOOGLE_STATE_MAX_AGE_SECONDS = 10 * 60;
export const GOOGLE_PENDING_MAX_AGE_SECONDS = 15 * 60;

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("JWT_SECRET is not set");
  }
  return new TextEncoder().encode(secret);
}

async function signToken(payload: Record<string, unknown>, maxAgeSeconds: number): Promise<string> {
  const secret = getJwtSecret();
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secret);
}

async function verifyToken<T extends Record<string, unknown>>(token: string): Promise<T | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload as T;
  } catch {
    return null;
  }
}

export async function createGoogleStateToken(state: GoogleAuthState): Promise<string> {
  return signToken({ ...state, kind: "google-auth-state" }, GOOGLE_STATE_MAX_AGE_SECONDS);
}

export async function verifyGoogleStateToken(token: string): Promise<GoogleAuthState | null> {
  const payload = await verifyToken<Record<string, unknown>>(token);
  if (!payload || payload.kind !== "google-auth-state") return null;

  const portal = payload.portal;
  const action = payload.action;
  if (portal !== "owner" && portal !== "tenant" && portal !== "admin") return null;
  if (action !== "login" && action !== "signup") return null;

  return {
    portal,
    action,
    platform: payload.platform === "app" ? "app" : payload.platform === "web" ? "web" : undefined,
    returnTo: typeof payload.returnTo === "string" ? payload.returnTo : undefined,
    managementType:
      payload.managementType === "rentals" || payload.managementType === "airbnb"
        ? payload.managementType
        : undefined,
    packageTier:
      payload.packageTier === "free" ||
      payload.packageTier === "one_percent" ||
      payload.packageTier === "full_management"
        ? payload.packageTier
        : undefined,
    tier: payload.tier === "free" || payload.tier === "premium" ? payload.tier : undefined,
    tenantPortal: payload.tenantPortal === "airbnb" ? "airbnb" : payload.tenantPortal === "rental" ? "rental" : undefined,
    nonce: typeof payload.nonce === "string" ? payload.nonce : undefined,
  };
}

export function getGoogleRedirectUri(params: { origin: string; platform?: GoogleAuthPlatform }): string {
  const webRedirect =
    process.env.GOOGLE_REDIRECT_URI_WEB?.trim() ||
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${params.origin}/api/auth/google/callback`;

  if (params.platform === "app") {
    return process.env.GOOGLE_REDIRECT_URI_APP?.trim() || GOOGLE_APP_REDIRECT_URI;
  }

  return webRedirect;
}

export async function createGooglePendingToken(profile: GooglePendingProfile): Promise<string> {
  return signToken({ ...profile, kind: "google-pending-profile" }, GOOGLE_PENDING_MAX_AGE_SECONDS);
}

export async function verifyGooglePendingToken(token: string): Promise<GooglePendingProfile | null> {
  const payload = await verifyToken<Record<string, unknown>>(token);
  if (!payload || payload.kind !== "google-pending-profile") return null;

  const portal = payload.portal;
  const action = payload.action;
  if (portal !== "owner" && portal !== "tenant" && portal !== "admin") return null;
  if (action !== "login" && action !== "signup") return null;
  if (typeof payload.userId !== "string" || !payload.userId) return null;
  if (typeof payload.role !== "string" || !payload.role) return null;
  if (typeof payload.email !== "string" || !payload.email) return null;
  if (typeof payload.name !== "string") return null;

  return {
    userId: payload.userId,
    role: payload.role,
    portal,
    action,
    email: payload.email,
    name: payload.name,
    phoneMissing: payload.phoneMissing !== false,
    returnTo: typeof payload.returnTo === "string" ? payload.returnTo : undefined,
    managementType:
      payload.managementType === "rentals" || payload.managementType === "airbnb"
        ? payload.managementType
        : undefined,
    packageTier:
      payload.packageTier === "free" ||
      payload.packageTier === "one_percent" ||
      payload.packageTier === "full_management"
        ? payload.packageTier
        : undefined,
    tier: payload.tier === "free" || payload.tier === "premium" ? payload.tier : undefined,
    tenantPortal: payload.tenantPortal === "airbnb" ? "airbnb" : payload.tenantPortal === "rental" ? "rental" : undefined,
    requiresOtpAfterPhone: payload.requiresOtpAfterPhone === true,
  };
}

export function buildGoogleAuthorizeUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", params.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

export async function exchangeGoogleCodeForProfile(params: {
  code: string;
  redirectUri: string;
}): Promise<GoogleProfile> {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.");
  }

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: params.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenJson = await tokenResponse.json().catch(() => ({}));
  if (!tokenResponse.ok) {
    throw new Error(tokenJson?.error_description || tokenJson?.error || "Google sign-in failed.");
  }

  const accessToken = tokenJson.access_token as string | undefined;
  if (!accessToken) {
    throw new Error("Google sign-in did not return an access token.");
  }

  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const profileJson = await profileResponse.json().catch(() => ({}));
  if (!profileResponse.ok) {
    throw new Error(profileJson?.error?.message || "Unable to fetch Google profile.");
  }

  const id = String(profileJson.id || profileJson.sub || "");
  const email = String(profileJson.email || "").trim().toLowerCase();
  const name = String(profileJson.name || profileJson.given_name || email || "Google User").trim();

  if (!id || !email) {
    throw new Error("Google profile is missing an email address.");
  }

  return {
    id,
    email,
    name,
    picture: typeof profileJson.picture === "string" ? profileJson.picture : undefined,
    emailVerified: Boolean(profileJson.verified_email ?? profileJson.email_verified),
  };
}
