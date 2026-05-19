/* Quick login helpers for the Capacitor app:
   - Biometric login via @capgo/capacitor-native-biometric (stores credentials in device keystore/keychain)
   - Optional app PIN login (stores encrypted credentials in Capacitor Preferences)
*/

"use client";

import { Preferences } from "@capacitor/preferences";

type LoginKind = "owner" | "tenant" | "admin";

type StoredCredentials = {
  email: string;
  password: string;
  kind: LoginKind;
};

type StoredPinBlobV1 = {
  v: 1;
  kind: LoginKind;
  createdAt: string;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
};

const PREF_PIN_BLOB_KEY_PREFIX = "quickLogin.pinBlob.v1:";
const PREF_OPT_OUT_KEY = "quickLogin.optOut";

function pinKey(kind: LoginKind): string {
  return `${PREF_PIN_BLOB_KEY_PREFIX}${kind}`;
}

function b64FromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function bytesFromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  // Construct from ArrayBuffer (not SharedArrayBuffer) so WebCrypto types accept it as BufferSource.
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveAesKeyFromPin(pin: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey("raw", enc.encode(pin), { name: "PBKDF2" }, false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 120_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function normalizePin(pin: string): string {
  return String(pin || "").replace(/\D/g, "");
}

function getBiometricServerKey(kind: LoginKind): string {
  // Must be stable across environments (dev/prod) so a user can reuse the same setup.
  return `sorana:${kind}`;
}

export async function isNativeCapacitor(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export async function hasPinSetup(): Promise<boolean> {
  const kinds: LoginKind[] = ["owner", "tenant", "admin"];
  for (const kind of kinds) {
    const existing = await Preferences.get({ key: pinKey(kind) });
    if (typeof existing.value === "string" && existing.value.length > 0) return true;
  }
  return false;
}

export async function hasPinSetupForKind(kind: LoginKind): Promise<boolean> {
  const existing = await Preferences.get({ key: pinKey(kind) });
  if (!existing.value) return false;
  try {
    const blob = JSON.parse(existing.value) as Partial<StoredPinBlobV1>;
    return blob?.v === 1 && blob?.kind === kind;
  } catch {
    return false;
  }
}

export async function clearPinSetup(kind: LoginKind): Promise<void> {
  await Preferences.remove({ key: pinKey(kind) });
}

export async function setPinCredentials(params: { pin: string; credentials: StoredCredentials }): Promise<void> {
  const pin = normalizePin(params.pin);
  if (pin.length < 4) throw new Error("PIN must be at least 4 digits.");

  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await deriveAesKeyFromPin(pin, salt);

  const plaintext = new TextEncoder().encode(JSON.stringify(params.credentials));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));

  const blob: StoredPinBlobV1 = {
    v: 1,
    kind: params.credentials.kind,
    createdAt: new Date().toISOString(),
    saltB64: b64FromBytes(salt),
    ivB64: b64FromBytes(iv),
    ciphertextB64: b64FromBytes(ciphertext),
  };

  await Preferences.set({ key: pinKey(params.credentials.kind), value: JSON.stringify(blob) });
}

export async function getPinCredentials(params: { pin: string; kind: LoginKind }): Promise<StoredCredentials> {
  const pin = normalizePin(params.pin);
  if (pin.length < 4) throw new Error("Invalid PIN.");

  const existing = await Preferences.get({ key: pinKey(params.kind) });
  if (!existing.value) throw new Error("PIN is not set up.");

  let blob: StoredPinBlobV1;
  try {
    blob = JSON.parse(existing.value) as StoredPinBlobV1;
  } catch {
    throw new Error("PIN setup is corrupted.");
  }

  if (blob?.v !== 1) throw new Error("Unsupported PIN setup version.");
  if (blob.kind !== params.kind) throw new Error("PIN login is not configured for this login type.");

  const salt = bytesFromB64(blob.saltB64) as Uint8Array<ArrayBuffer>;
  const iv = bytesFromB64(blob.ivB64) as Uint8Array<ArrayBuffer>;
  const ciphertext = bytesFromB64(blob.ciphertextB64);
  const key = await deriveAesKeyFromPin(pin, salt);

  let plaintextBytes: ArrayBuffer;
  try {
    plaintextBytes = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  } catch {
    throw new Error("Incorrect PIN.");
  }

  const decoded = new TextDecoder().decode(new Uint8Array(plaintextBytes));
  const creds = JSON.parse(decoded) as StoredCredentials;

  if (!creds?.email || !creds?.password) throw new Error("PIN credentials are invalid.");
  if (creds.kind !== params.kind) throw new Error("PIN credentials mismatch.");

  return creds;
}

export async function isBiometricsAvailable(): Promise<boolean> {
  const native = await isNativeCapacitor();
  if (!native) return false;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    const res = await NativeBiometric.isAvailable();
    return !!res?.isAvailable;
  } catch {
    return false;
  }
}

export async function hasBiometricCredentials(kind: LoginKind): Promise<boolean> {
  const native = await isNativeCapacitor();
  if (!native) return false;
  try {
    const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");
    const res = await NativeBiometric.isCredentialsSaved({ server: getBiometricServerKey(kind) } as any);
    return Boolean((res as any)?.isSaved);
  } catch {
    return false;
  }
}

export async function saveBiometricCredentials(params: StoredCredentials): Promise<void> {
  const native = await isNativeCapacitor();
  if (!native) throw new Error("Not running on a native device.");
  const { NativeBiometric, AccessControl } = await import("@capgo/capacitor-native-biometric");

  await NativeBiometric.setCredentials({
    username: params.email,
    password: params.password,
    server: getBiometricServerKey(params.kind),
    // Require biometrics to retrieve credentials (prevents plain keystore reads).
    accessControl: (AccessControl as any).BIOMETRY_ANY,
  } as any);
}

export async function getBiometricCredentials(kind: LoginKind): Promise<StoredCredentials> {
  const native = await isNativeCapacitor();
  if (!native) throw new Error("Not running on a native device.");
  const { NativeBiometric } = await import("@capgo/capacitor-native-biometric");

  const res = await (NativeBiometric as any).getSecureCredentials({
    server: getBiometricServerKey(kind),
    reason: "Sign in to Sorana",
    title: "Biometric Sign-In",
  } as any);

  const email = String((res as any)?.username || "");
  const password = String((res as any)?.password || "");
  if (!email || !password) throw new Error("No saved credentials.");
  return { email, password, kind };
}

export async function userOptedOutOfQuickLoginPrompt(): Promise<boolean> {
  const res = await Preferences.get({ key: PREF_OPT_OUT_KEY });
  return res.value === "1";
}

export async function setUserOptedOutOfQuickLoginPrompt(optOut: boolean): Promise<void> {
  await Preferences.set({ key: PREF_OPT_OUT_KEY, value: optOut ? "1" : "0" });
}
