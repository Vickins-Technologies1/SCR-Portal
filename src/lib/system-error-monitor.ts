import "server-only";

import { randomUUID } from "node:crypto";
import type { Collection, Db } from "mongodb";
import { connectToDatabase } from "./mongodb";
import logger from "./logger";

export type ErrorSeverity = "INFO" | "WARNING" | "ERROR" | "CRITICAL";

export type ErrorContext = {
  route?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  userId?: string | null;
  userEmail?: string | null;
  accountId?: string | null;
  propertyOwnerId?: string | null;
  requestId?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

type StoredError = Document & {
  errorId: string;
  fingerprint: string;
  errorName: string;
  message: string;
  stack?: string;
  severity: ErrorSeverity;
  environment: string;
  route?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  userId?: string | null;
  userEmail?: string | null;
  accountId?: string | null;
  propertyOwnerId?: string | null;
  requestId?: string | null;
  occurrenceCount: number;
  firstOccurred: Date;
  lastOccurred: Date;
  emailSentCount: number;
  lastEmailSentAt?: Date;
  emailFailure?: string;
  resolved: boolean;
  metadata?: Record<string, unknown>;
};

const MAX_TEXT = 12_000;
const MAX_METADATA = 8_000;
const ALERT_THRESHOLD = Math.max(1, Number(process.env.ERROR_ALERT_REPEAT_THRESHOLD || 25));
const ALERT_COOLDOWN_MS = Math.max(60_000, Number(process.env.ERROR_ALERT_COOLDOWN_MS || 900_000));

const redactKey = /(password|token|secret|authorization|cookie|api[-_]?key|passkey|private[-_]?key|credential|otp|mpesa)/i;

function truncate(value: string, limit = MAX_TEXT) {
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

export function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[TRUNCATED]";
  if (value instanceof Error) return { name: value.name, message: truncate(value.message), stack: truncate(value.stack || "") };
  if (typeof value === "string") return truncate(value);
  if (value === null || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeValue(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 80)) {
      result[key] = redactKey.test(key) ? "[REDACTED]" : sanitizeValue(item, depth + 1);
    }
    return result;
  }
  return String(value);
}

function safeMetadata(metadata?: Record<string, unknown>) {
  try {
    return JSON.parse(truncate(JSON.stringify(sanitizeValue(metadata || {})), MAX_METADATA)) as Record<string, unknown>;
  } catch {
    return { note: "Metadata could not be serialized" };
  }
}

function asError(error: unknown) {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" ? error : "Unknown application error");
}

function fingerprintFor(error: Error, context: ErrorContext) {
  return [error.name, error.message, context.endpoint || context.route || "", context.method || "", context.statusCode || ""].join("|").slice(0, 500);
}

function environmentAllowed() {
  const environments = (process.env.ERROR_ALERT_ENVIRONMENTS || "production").split(",").map((v) => v.trim().toLowerCase());
  return environments.includes((process.env.NODE_ENV || "development").toLowerCase());
}

function collection(db: Db): Collection<StoredError> {
  return db.collection("systemErrorLogs") as Collection<StoredError>;
}

export async function captureException(error: unknown, context: ErrorContext = {}): Promise<{ errorId: string; occurrenceCount: number } | null> {
  const normalized = asError(error);
  const now = new Date();
  const fingerprint = fingerprintFor(normalized, context);
  const sanitizedContext = { ...context, metadata: safeMetadata(context.metadata) };

  try {
    const { db } = await connectToDatabase();
    const errors = collection(db);
    const existing = await errors.findOne({ fingerprint });
    const errorId = existing?.errorId || `ERR-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    const occurrenceCount = (existing?.occurrenceCount || 0) + 1;
    await errors.updateOne(
      { fingerprint },
      {
        $set: {
          errorId, errorName: normalized.name || "Error", message: truncate(normalized.message),
          stack: truncate(normalized.stack || ""), severity: context.statusCode && context.statusCode >= 500 ? "CRITICAL" : "ERROR",
          environment: process.env.NODE_ENV || "development", ...sanitizedContext,
          occurrenceCount, lastOccurred: now, updatedAt: now,
        },
        $setOnInsert: { fingerprint, firstOccurred: now, emailSentCount: 0, resolved: false, createdAt: now },
      },
      { upsert: true },
    );

    const shouldAlert = environmentAllowed() && (!existing || occurrenceCount % ALERT_THRESHOLD === 0) &&
      (!existing?.lastEmailSentAt || now.getTime() - existing.lastEmailSentAt.getTime() >= ALERT_COOLDOWN_MS);
    if (shouldAlert) {
      try {
        const { sendSystemErrorAlert } = await import("./email");
        await sendSystemErrorAlert({
          errorId, occurrenceCount, firstOccurred: existing?.firstOccurred || now, lastOccurred: now,
          errorName: normalized.name || "Error", message: truncate(normalized.message), stack: truncate(normalized.stack || ""),
          severity: context.statusCode && context.statusCode >= 500 ? "CRITICAL" : "ERROR",
          environment: process.env.NODE_ENV || "development", context: sanitizedContext,
        });
        await errors.updateOne({ fingerprint }, { $inc: { emailSentCount: 1 }, $set: { lastEmailSentAt: new Date(), updatedAt: new Date() }, $unset: { emailFailure: "" } });
      } catch (emailError) {
        logger.error("System error alert email failed", { errorId, error: emailError instanceof Error ? emailError.message : String(emailError) });
        await errors.updateOne({ fingerprint }, { $set: { emailFailure: truncate(emailError instanceof Error ? emailError.message : String(emailError)), updatedAt: new Date() } }).catch(() => undefined);
      }
    }
    return { errorId, occurrenceCount };
  } catch (monitoringError) {
    logger.error("System error monitoring failed", { error: monitoringError instanceof Error ? monitoringError.message : String(monitoringError) });
    return null;
  }
}

export const captureError = captureException;

export async function recordBusinessAnomaly(type: string, details: Record<string, unknown>, context: ErrorContext = {}) {
  return captureException(new Error(`Business logic anomaly: ${type}`), {
    ...context,
    metadata: { anomalyType: type, ...details, ...(context.metadata || {}) },
    statusCode: context.statusCode || 422,
  });
}

export function isExpectedError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /invalid|validation|unauthorized|forbidden|not found|expired|duplicate|required/i.test(message);
}
