import "server-only";
import { Db, ObjectId } from "mongodb";
import { decryptDarajaSecret, encryptDarajaSecret, isLikelyEncryptedDarajaSecret } from "@/lib/daraja-crypto";
import { maskSecret } from "@/lib/owner-integrations";
import { getMpesaPasskey, getMpesaShortcode } from "@/lib/mpesa";

export type OwnerDarajaMode = "shared_daraja" | "user_paybill";
export type OwnerDarajaEnvironment = "sandbox" | "production";
export type OwnerDarajaPaymentType = "till" | "paybill";

type OwnerDarajaDoc = {
  ownerId?: ObjectId;
  daraja?: {
    shared?: {
      enabled?: boolean;
      paymentType?: OwnerDarajaPaymentType;
      destinationNumber?: string;
      accountReference?: string;
      createdAt?: string;
      updatedAt?: string;
    };
    userPaybill?: {
      enabled?: boolean;
      environment?: OwnerDarajaEnvironment;
      shortcode?: string;
      consumerKey?: string;
      consumerSecret?: string;
      passkey?: string;
      createdAt?: string;
      updatedAt?: string;
    };
  };
};

export type OwnerDarajaSharedView = {
  enabled: boolean;
  mode: OwnerDarajaMode;
  paymentType: OwnerDarajaPaymentType;
  destinationNumber: string;
  maskedDestinationNumber: string;
  accountReference: string;
  hasDestinationNumber: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type OwnerDarajaUserPaybillView = {
  enabled: boolean;
  mode: OwnerDarajaMode;
  environment: OwnerDarajaEnvironment;
  shortcode: string;
  maskedShortcode: string;
  maskedConsumerKey: string;
  hasCredentials: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type OwnerDarajaIntegrationView = {
  shared: OwnerDarajaSharedView;
  userPaybill: OwnerDarajaUserPaybillView;
};

export type OwnerDarajaResolvedCredentials = {
  mode: OwnerDarajaMode;
  environment: OwnerDarajaEnvironment;
  shortcode: string;
  passkey: string;
  consumerKey: string;
  consumerSecret: string;
  destinationNumber?: string;
  accountReference?: string;
  paymentType?: OwnerDarajaPaymentType;
};

function decryptMaybe(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (!isLikelyEncryptedDarajaSecret(raw)) return raw;

  try {
    return decryptDarajaSecret(raw);
  } catch {
    return "";
  }
}

function encryptIfPresent(value?: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return encryptDarajaSecret(raw);
}

function normalizePaymentType(value?: string): OwnerDarajaPaymentType {
  return value === "till" ? "till" : "paybill";
}

function normalizeEnvironment(value?: string): OwnerDarajaEnvironment {
  return value === "production" ? "production" : "sandbox";
}

function getDocView(doc?: OwnerDarajaDoc | null): OwnerDarajaIntegrationView {
  const shared = doc?.daraja?.shared || {};
  const userPaybill = doc?.daraja?.userPaybill || {};
  const destinationNumber = decryptMaybe(shared.destinationNumber);
  const shortcode = decryptMaybe(userPaybill.shortcode);
  const consumerKey = decryptMaybe(userPaybill.consumerKey);
  const consumerSecret = decryptMaybe(userPaybill.consumerSecret);
  const passkey = decryptMaybe(userPaybill.passkey);

  return {
    shared: {
      enabled: shared.enabled !== false,
      mode: "shared_daraja",
      paymentType: normalizePaymentType(shared.paymentType),
      destinationNumber,
      maskedDestinationNumber: maskSecret(destinationNumber),
      accountReference: String(shared.accountReference || "").trim(),
      hasDestinationNumber: !!destinationNumber,
      createdAt: shared.createdAt,
      updatedAt: shared.updatedAt,
    },
    userPaybill: {
      enabled: userPaybill.enabled !== false,
      mode: "user_paybill",
      environment: normalizeEnvironment(userPaybill.environment),
      shortcode,
      maskedShortcode: maskSecret(shortcode),
      maskedConsumerKey: maskSecret(consumerKey),
      hasCredentials: !!(shortcode && consumerKey && consumerSecret && passkey),
      createdAt: userPaybill.createdAt,
      updatedAt: userPaybill.updatedAt,
    },
  };
}

export async function getOwnerDarajaIntegrations(db: Db, ownerId: string): Promise<OwnerDarajaIntegrationView> {
  if (!ObjectId.isValid(ownerId)) {
    return getDocView(null);
  }

  const doc = await db.collection("ownerIntegrations").findOne(
    { ownerId: new ObjectId(ownerId) },
    { projection: { daraja: 1 } }
  );

  return getDocView(doc as OwnerDarajaDoc | null);
}

export async function saveOwnerDarajaSharedIntegration(
  db: Db,
  ownerId: string,
  params: {
    enabled: boolean;
    paymentType: OwnerDarajaPaymentType;
    destinationNumber: string;
    accountReference: string;
  }
): Promise<OwnerDarajaIntegrationView> {
  if (!ObjectId.isValid(ownerId)) {
    throw new Error("Invalid ownerId");
  }

  const now = new Date().toISOString();
  const existing = (await db.collection("ownerIntegrations").findOne(
    { ownerId: new ObjectId(ownerId) },
    { projection: { daraja: 1 } }
  )) as OwnerDarajaDoc | null;

  const existingShared = existing?.daraja?.shared || {};
  const destinationNumber = params.destinationNumber.trim() || decryptMaybe(existingShared.destinationNumber);
  const accountReference = params.accountReference.trim() || String(existingShared.accountReference || "").trim();

  const updateDoc = {
    ownerId: new ObjectId(ownerId),
    daraja: {
      ...(existing?.daraja || {}),
      shared: {
        enabled: params.enabled,
        paymentType: params.paymentType,
        destinationNumber: destinationNumber ? encryptIfPresent(destinationNumber) : "",
        accountReference,
        createdAt: existingShared.createdAt || now,
        updatedAt: now,
      },
    },
    updatedAt: now,
  };

  await db.collection("ownerIntegrations").updateOne(
    { ownerId: new ObjectId(ownerId) },
    { $set: updateDoc, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );

  return getOwnerDarajaIntegrations(db, ownerId);
}

export async function saveOwnerDarajaUserPaybillIntegration(
  db: Db,
  ownerId: string,
  params: {
    enabled: boolean;
    environment: OwnerDarajaEnvironment;
    shortcode: string;
    consumerKey: string;
    consumerSecret: string;
    passkey: string;
  }
): Promise<OwnerDarajaIntegrationView> {
  if (!ObjectId.isValid(ownerId)) {
    throw new Error("Invalid ownerId");
  }

  const now = new Date().toISOString();
  const existing = (await db.collection("ownerIntegrations").findOne(
    { ownerId: new ObjectId(ownerId) },
    { projection: { daraja: 1 } }
  )) as OwnerDarajaDoc | null;

  const existingUser = existing?.daraja?.userPaybill || {};
  const shortcode = params.shortcode.trim() || decryptMaybe(existingUser.shortcode);
  const consumerKey = params.consumerKey.trim() || decryptMaybe(existingUser.consumerKey);
  const consumerSecret = params.consumerSecret.trim() || decryptMaybe(existingUser.consumerSecret);
  const passkey = params.passkey.trim() || decryptMaybe(existingUser.passkey);

  const updateDoc = {
    ownerId: new ObjectId(ownerId),
    daraja: {
      ...(existing?.daraja || {}),
      userPaybill: {
        enabled: params.enabled,
        environment: params.environment,
        shortcode: shortcode ? encryptIfPresent(shortcode) : "",
        consumerKey: consumerKey ? encryptIfPresent(consumerKey) : "",
        consumerSecret: consumerSecret ? encryptIfPresent(consumerSecret) : "",
        passkey: passkey ? encryptIfPresent(passkey) : "",
        createdAt: existingUser.createdAt || now,
        updatedAt: now,
      },
    },
    updatedAt: now,
  };

  await db.collection("ownerIntegrations").updateOne(
    { ownerId: new ObjectId(ownerId) },
    { $set: updateDoc, $setOnInsert: { createdAt: now } },
    { upsert: true }
  );

  return getOwnerDarajaIntegrations(db, ownerId);
}

export async function deleteOwnerDarajaIntegration(
  db: Db,
  ownerId: string,
  mode?: OwnerDarajaMode
): Promise<OwnerDarajaIntegrationView> {
  if (!ObjectId.isValid(ownerId)) {
    throw new Error("Invalid ownerId");
  }

  const now = new Date().toISOString();
  const unset: Record<string, string> = {};
  if (!mode || mode === "shared_daraja") {
    unset["daraja.shared"] = "";
  }
  if (!mode || mode === "user_paybill") {
    unset["daraja.userPaybill"] = "";
  }

  await db.collection("ownerIntegrations").updateOne(
    { ownerId: new ObjectId(ownerId) },
    { $unset: unset, $set: { updatedAt: now }, $setOnInsert: { createdAt: now, ownerId: new ObjectId(ownerId) } },
    { upsert: true }
  );

  return getOwnerDarajaIntegrations(db, ownerId);
}

export async function resolveOwnerDarajaStkConfig(
  db: Db,
  ownerId: string,
  mode: OwnerDarajaMode
): Promise<OwnerDarajaResolvedCredentials> {
  if (mode === "shared_daraja") {
    const doc = await db.collection("ownerIntegrations").findOne(
      { ownerId: new ObjectId(ownerId) },
      { projection: { daraja: 1 } }
    );

    const shared = doc?.daraja?.shared || {};
    const destinationNumber = decryptMaybe(shared.destinationNumber);
    if (!destinationNumber) {
      throw new Error("Shared Daraja destination number is not configured");
    }

    const shortcode = getMpesaShortcode();
    const passkey = getMpesaPasskey();

    return {
      mode,
      environment: (process.env.MPESA_ENVIRONMENT === "production" ? "production" : "sandbox"),
      shortcode,
      passkey,
      consumerKey: process.env.MPESA_CONSUMER_KEY || "",
      consumerSecret: process.env.MPESA_CONSUMER_SECRET || "",
      destinationNumber,
      accountReference: String(shared.accountReference || destinationNumber || "").trim() || destinationNumber,
      paymentType: normalizePaymentType(shared.paymentType),
    };
  }

  const doc = await db.collection("ownerIntegrations").findOne(
    { ownerId: new ObjectId(ownerId) },
    { projection: { daraja: 1 } }
  );

  const userPaybill = doc?.daraja?.userPaybill || {};
  const shortcode = decryptMaybe(userPaybill.shortcode);
  const consumerKey = decryptMaybe(userPaybill.consumerKey);
  const consumerSecret = decryptMaybe(userPaybill.consumerSecret);
  const passkey = decryptMaybe(userPaybill.passkey);
  const environment = normalizeEnvironment(userPaybill.environment);

  if (!shortcode || !consumerKey || !consumerSecret || !passkey) {
    throw new Error("User-owned Paybill credentials are incomplete");
  }

  return {
    mode,
    environment,
    shortcode,
    passkey,
    consumerKey,
    consumerSecret,
  };
}
