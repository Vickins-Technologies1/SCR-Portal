// src/lib/reminders.ts
import { ObjectId } from "mongodb";
import { connectToDatabase } from "./mongodb";
import { sendWelcomeSms } from "./sms";
import { sendWhatsAppMessage } from "./whatsapp";
import { sendReminderEmail } from "./email";
import logger from "./logger";
import { Property } from "../types/property";
import { Tenant } from "../types/tenant";
import { calculateTenantFinancialState } from "./tenant-payment-allocation";
import { fetchActiveRentOverridesByPropertyIds } from "./rent-overrides";
import { addBusinessDays, businessDateKey, businessDateTime, businessDateIsBefore, businessDayEnd, businessDayStart, businessDueDate, businessDateParts } from "./business-time";
import { calculateReminderDueAmounts } from "./reminder-calculations";

type ReminderType = "fiveDaysBefore" | "paymentDate";

interface ReminderNotification {
  _id: ObjectId;
  message: string;
  type: "payment";
  createdAt: string;
  status: "read" | "unread";
  tenantId: string;
  tenantName: string;
  ownerId: string;
  deliveryMethod: "app" | "sms" | "email" | "whatsapp" | "both";
  deliveryStatus?: "pending" | "success" | "failed";
  errorDetails?: string | null;
  reminderKey?: string;
  updatedAt?: string;
  reminderType?: ReminderType;
  dueDate?: string;
  dueAmounts?: {
    rentDue: number;
    utilityDue: number;
    depositDue: number;
    penaltiesDue: number;
    totalDue: number;
  };
}

interface ReminderResult {
  sent: number;
  skipped: number;
  notifications: ReminderNotification[];
}

export interface UpcomingReminder {
  tenantId: string;
  tenantName: string;
  propertyName: string;
  houseNumber: string;
  rentDue: number;
  utilityDue: number;
  depositDue: number;
  penaltiesDue: number;
  totalDue: number;
  dueDate: string;
  reminderType: ReminderType;
}

const startOfDay = businessDayStart;
const endOfDay = businessDayEnd;
const isSameDay = (a: Date, b: Date) => businessDateKey(a) === businessDateKey(b);
const toDateKey = businessDateKey;

const getDueDateForMonth = (year: number, month: number, paymentDay: number) => {
  return businessDueDate(year, month, paymentDay);
};

const getNextDueDate = (today: Date, paymentDay: number) => {
  const todayStart = startOfDay(today);
  const { year, month } = businessDateParts(todayStart);
  const dueThisMonth = getDueDateForMonth(year, month - 1, paymentDay);
  if (businessDateIsBefore(dueThisMonth, todayStart)) {
    return getDueDateForMonth(year, month, paymentDay);
  }
  return dueThisMonth;
};

const addDays = addBusinessDays;

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? businessDateTime({ year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)), day: Number(value.slice(8, 10)) })
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const isLeaseActiveOn = (tenant: Tenant, date: Date): boolean => {
  const leaseStart = parseDate(tenant.leaseStartDate);
  const leaseEnd = parseDate(tenant.leaseEndDate);
  if (leaseStart && startOfDay(date) < startOfDay(leaseStart)) return false;
  if (leaseEnd && startOfDay(date) > endOfDay(leaseEnd)) return false;
  return true;
};

const isLeaseCoveringDate = (tenant: Tenant, date: Date): boolean => {
  const leaseStart = parseDate(tenant.leaseStartDate);
  const leaseEnd = parseDate(tenant.leaseEndDate);
  if (leaseStart && startOfDay(date) < startOfDay(leaseStart)) return false;
  if (leaseEnd && startOfDay(date) > endOfDay(leaseEnd)) return false;
  return true;
};

export const buildReminderMessages = (
  reminderType: ReminderType,
  tenantName: string,
  propertyName: string,
  houseNumber: string,
  formattedDueDate: string,
  smsDueDate: string,
  rentDue: number,
  utilityDue: number,
  depositDue: number,
  totalDue: number,
  penaltiesDue = 0
) => {
  const whenText = reminderType === "fiveDaysBefore" ? `by ${formattedDueDate}` : `today (${formattedDueDate})`;
  const safeAmount = (value: number) => Number.isFinite(value) ? Math.max(0, Math.round(value * 100) / 100) : 0;
  rentDue = safeAmount(rentDue);
  utilityDue = safeAmount(utilityDue);
  depositDue = safeAmount(depositDue);
  penaltiesDue = safeAmount(penaltiesDue);
  totalDue = safeAmount(rentDue + utilityDue + depositDue + penaltiesDue);
  const shortTotal = totalDue.toFixed(2);

  const normalizeSms = (value: string) => value.replace(/\s+/g, " ").trim();

  const shortBreakdown = [
    rentDue > 0 ? `Rent Ksh ${rentDue.toFixed(2)}` : null,
    utilityDue > 0 ? `Utilities Ksh ${utilityDue.toFixed(2)}` : null,
    depositDue > 0 ? `Deposit Ksh ${depositDue.toFixed(2)}` : null,
    penaltiesDue > 0 ? `Penalties Ksh ${penaltiesDue.toFixed(2)}` : null,
  ].filter(Boolean).join(" ");

  const smsTotal = totalDue.toFixed(2);
  const smsWhen = reminderType === "fiveDaysBefore" ? smsDueDate : `${smsDueDate} (today)`;
  const smsCore = `Payment reminder: Ksh ${smsTotal} total due ${smsWhen} ${propertyName} (${houseNumber}).`;
  const smsWithBreakdown = `${smsCore} ${shortBreakdown || "No balance components."}`;
  const smsWithFooter = `${smsWithBreakdown} Pay portal. If paid, ignore.`;
  const smsMessage = normalizeSms(smsWithFooter);

  const breakdownLines = [
    rentDue > 0 ? `Rent: Ksh ${rentDue.toFixed(2)}` : null,
    utilityDue > 0 ? `Utilities: Ksh ${utilityDue.toFixed(2)}` : null,
    depositDue > 0 ? `Deposit: Ksh ${depositDue.toFixed(2)}` : null,
    penaltiesDue > 0 ? `Penalties: Ksh ${penaltiesDue.toFixed(2)}` : null,
  ].filter(Boolean);

  const whatsappMessage =
    `Dear ${tenantName},\n\n` +
    `This is an official payment reminder for ${propertyName}, Unit ${houseNumber}.\n` +
    `Amount due ${whenText}: Ksh ${shortTotal}\n\n` +
    `Breakdown:\n` +
    `${breakdownLines.length > 0 ? `${breakdownLines.join("\n")}\n` : ""}` +
    `Total amount due: Ksh ${totalDue.toFixed(2)}\n\n` +
    `Kindly settle your payment via the tenant portal. If you have already paid, please ignore this notice.`;

  const appMessage = `Payment Reminder: Ksh ${shortTotal} total due ${whenText} for ${propertyName} (${houseNumber}).`;

  return { smsMessage, whatsappMessage, appMessage };
};

export async function sendPaymentReminders(params: { ownerId?: string; today?: Date }): Promise<ReminderResult> {
  const { ownerId, today = new Date() } = params;
  const todayStart = startOfDay(today);

  const { db } = await connectToDatabase();

  const ownerFilter = ownerId
    ? ObjectId.isValid(ownerId)
      ? { $in: [ownerId, new ObjectId(ownerId)] }
      : ownerId
    : undefined;
  const activePropertyFilter = {
    $or: [
      { status: { $in: ["Active", "active"] } },
      { status: { $exists: false } },
    ],
  };
  const propertyFilter = ownerId ? { ownerId: ownerFilter, ...activePropertyFilter } : activePropertyFilter;
  const properties = await db.collection<Property>("properties").find(propertyFilter).toArray();

  if (properties.length === 0) {
    return { sent: 0, skipped: 0, notifications: [] };
  }

  const propertyMap = new Map<string, Property>();
  const ownerIds = new Set<string>();
  for (const property of properties) {
    propertyMap.set(property._id.toString(), property);
    ownerIds.add(String(property.ownerId));
  }

  const tenantFilter: Record<string, unknown> = ownerId
    ? { ownerId: ownerFilter, status: "active" }
    : { ownerId: { $in: Array.from(ownerIds) }, status: "active" };

  const tenants = await db.collection<Tenant>("tenants").find(tenantFilter).toArray();

  if (tenants.length === 0) {
    return { sent: 0, skipped: 0, notifications: [] };
  }

  const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(
    db,
    Array.from(propertyMap.keys())
  );
  let sent = 0;
  let skipped = 0;
  const createdNotifications: ReminderNotification[] = [];

  for (const tenant of tenants) {
    const tenantId = tenant._id.toString();
    const property = propertyMap.get(String(tenant.propertyId));
    if (!property) continue;
    if (!isLeaseActiveOn(tenant, todayStart)) continue;

    const leaseStart = parseDate(tenant.leaseStartDate);
    const paymentDay = property.rentPaymentDate ?? (leaseStart ? businessDateParts(leaseStart).day : undefined);
    if (!paymentDay) continue;

    let dueDate = getNextDueDate(todayStart, paymentDay);
    if (leaseStart && dueDate < startOfDay(leaseStart)) {
      dueDate = getNextDueDate(startOfDay(leaseStart), paymentDay);
    }

    if (!isLeaseCoveringDate(tenant, dueDate)) continue;

    const reminderDate = addDays(dueDate, -5);

    const reminderType: ReminderType | null =
      isSameDay(todayStart, dueDate) ? "paymentDate" :
      isSameDay(todayStart, reminderDate) ? "fiveDaysBefore" :
      null;

    if (!reminderType) continue;

    const dueDateKey = toDateKey(dueDate);

    const reminderKey = `payment:${String(property.ownerId)}:${tenantId}:${reminderType}:${dueDateKey}`;
    const existingReminder = await db.collection<ReminderNotification>("notifications").findOne({
      $or: [
        { reminderKey },
        {
      ownerId: String(property.ownerId),
      tenantId,
      type: "payment",
      reminderType,
      dueDate: dueDateKey,
        },
      ],
    });

    const existingUpdatedAtMs = existingReminder?.updatedAt
      ? Date.parse(existingReminder.updatedAt)
      : NaN;
    const canRetryExisting = existingReminder && (
      existingReminder.deliveryStatus === "failed" ||
      (existingReminder.deliveryStatus === "pending" &&
        Number.isFinite(existingUpdatedAtMs) &&
        Date.now() - existingUpdatedAtMs >= 15 * 60 * 1000)
    );

    // A successful or recently claimed reminder is idempotently complete. A
    // stale pending claim can be reclaimed after a crashed provider call;
    // legacy pending rows without a timestamp remain protected from replay.
    if (existingReminder && !canRetryExisting) {
      skipped += 1;
      continue;
    }

    let state;
    try {
      state = await calculateTenantFinancialState(db, tenant, {
        // The scheduled obligation is the due-date state. Use the end of the
        // local due date so a payment posted later on the due date is visible.
        asOf: endOfDay(dueDate),
        property,
        rentOverrideMap,
      });
    } catch (error) {
      logger.error("Unable to calculate tenant reminder balance", {
        tenantId,
        propertyId: String(property._id),
        error: error instanceof Error ? error.message : String(error),
      });
      skipped += 1;
      continue;
    }

    if (!Number.isFinite(state.totalOutstanding)) {
      logger.error("Tenant reminder balance was not finite", { tenantId, propertyId: String(property._id) });
      skipped += 1;
      continue;
    }

    // Re-read the authoritative state immediately before any provider call.
    // A payment can be posted after the eligibility query and must suppress a
    // now-paid reminder rather than relying on a cached tenant projection.
    try {
      state = await calculateTenantFinancialState(db, tenant, {
        asOf: endOfDay(dueDate),
        property,
        rentOverrideMap,
      });
    } catch (error) {
      logger.error("Unable to recheck tenant reminder balance", {
        tenantId,
        propertyId: String(property._id),
        error: error instanceof Error ? error.message : String(error),
      });
      skipped += 1;
      continue;
    }

    const amounts = calculateReminderDueAmounts({
      rentAmount: state.rentOutstanding,
      utilityAmount: state.utilitiesOutstanding,
      depositAmount: state.depositOutstanding,
      penaltiesAmount: state.penalties,
    });
    const { rentDue, utilityDue, depositDue, penaltiesDue, totalDue } = amounts;

    if (totalDue <= 0) {
      skipped += 1;
      continue;
    }

    const formattedDueDate = dueDate.toLocaleDateString("en-US", {
      timeZone: "Africa/Nairobi",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const smsDueDate = dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "Africa/Nairobi" });

    const unitLabel = (tenant.leasedUnits && tenant.leasedUnits.length > 0)
      ? tenant.leasedUnits.map((unit) => unit.houseNumber).filter(Boolean).join(", ")
      : tenant.houseNumber;
    const effectiveUnitLabel = unitLabel || "Unit";

    const { smsMessage, whatsappMessage, appMessage } = buildReminderMessages(
      reminderType,
      tenant.name,
      property.name,
      effectiveUnitLabel,
      formattedDueDate,
      smsDueDate,
      rentDue,
      utilityDue,
      depositDue,
      totalDue,
      penaltiesDue
    );

    const deliveryMethod = tenant.deliveryMethod || "both";
    let deliveryStatus: ReminderNotification["deliveryStatus"] = deliveryMethod === "app" ? "success" : "pending";
    let errorDetails: string | null = null;

    const recordFailure = (detail: string) => {
      deliveryStatus = "failed";
      errorDetails = errorDetails ? `${errorDetails}; ${detail}` : detail;
    };

    const newNotification: ReminderNotification = {
      _id: new ObjectId(),
      message: appMessage,
      type: "payment",
      createdAt: new Date().toISOString(),
      status: "unread",
      tenantId,
      tenantName: tenant.name,
      ownerId: String(property.ownerId),
      deliveryMethod,
      deliveryStatus: "pending",
      errorDetails: null,
      updatedAt: new Date().toISOString(),
      reminderType,
      dueDate: dueDateKey,
      reminderKey,
      dueAmounts: {
        rentDue,
        utilityDue,
        depositDue,
        penaltiesDue,
        totalDue,
      },
    };

    // Claim the scheduled event before calling any provider. The unique
    // reminder key plus the conditional failed-row update makes overlapping
    // cron invocations converge on one delivery attempt.
    let claimedId = newNotification._id;
    try {
      if (existingReminder) {
        const claimed = await db.collection<ReminderNotification>("notifications").updateOne(
          {
            _id: existingReminder._id,
            deliveryStatus: existingReminder.deliveryStatus,
            ...(existingReminder.updatedAt ? { updatedAt: existingReminder.updatedAt } : {}),
          },
          {
            $set: {
              message: newNotification.message,
              dueAmounts: newNotification.dueAmounts,
              deliveryStatus: "pending",
              errorDetails: null,
              updatedAt: new Date().toISOString(),
              reminderKey,
            },
          },
        );
        if (!claimed.matchedCount) {
          skipped += 1;
          continue;
        }
        claimedId = existingReminder._id;
      } else {
        const claimed = await db.collection<ReminderNotification>("notifications").updateOne(
          { reminderKey },
          { $setOnInsert: newNotification },
          { upsert: true },
        );
        if (!claimed.upsertedCount) {
          skipped += 1;
          continue;
        }
      }
    } catch (error: any) {
      if (error?.code === 11000) {
        skipped += 1;
        continue;
      }
      throw error;
    }

    if (deliveryMethod === "sms" || deliveryMethod === "both") {
      if (tenant.phone) {
        try {
          await sendWelcomeSms({ phone: tenant.phone, message: smsMessage });
          if (deliveryStatus === "pending") {
            deliveryStatus = "success";
          }
        } catch (error) {
          logger.error("Reminder SMS failed", { tenantId, error });
          recordFailure("SMS failed");
        }
      } else {
        recordFailure("Missing phone for SMS");
      }
    }

    if (deliveryMethod === "email" || deliveryMethod === "both") {
      if (tenant.email) {
        try {
          await sendReminderEmail({
            to: tenant.email,
            name: tenant.name,
            propertyName: property.name,
            houseNumber: tenant.houseNumber,
            rentDue,
            utilityDue,
            depositDue,
            penaltiesDue,
            totalDue,
            dueDate: formattedDueDate,
            reminderType,
          });
          if (deliveryStatus === "pending") {
            deliveryStatus = "success";
          }
        } catch (error) {
          logger.error("Reminder email failed", { tenantId, error });
          recordFailure("Email failed");
        }
      } else {
        recordFailure("Missing email for email delivery");
      }
    }

    if (deliveryMethod === "whatsapp" || deliveryMethod === "both") {
      if (tenant.phone) {
        try {
          const waResult = await sendWhatsAppMessage({ phone: tenant.phone, message: whatsappMessage });
          if (!waResult.success) {
            recordFailure(`WhatsApp failed: ${waResult.error?.message || "Unknown error"}`);
          } else if (deliveryStatus === "pending") {
            deliveryStatus = "success";
          }
        } catch (error) {
          logger.error("Reminder WhatsApp failed", { tenantId, error });
          recordFailure("WhatsApp failed");
        }
      } else {
        recordFailure("Missing phone for WhatsApp");
      }
    }

    const completedNotification = { ...newNotification, _id: claimedId, deliveryStatus, errorDetails };
    await db.collection<ReminderNotification>("notifications").updateOne(
      { _id: claimedId },
      { $set: { deliveryStatus, errorDetails, updatedAt: new Date().toISOString(), dueAmounts: newNotification.dueAmounts, message: newNotification.message } },
    );
    createdNotifications.push(completedNotification);
    if (deliveryStatus === "success") sent += 1;
    else skipped += 1;
  }

  return { sent, skipped, notifications: createdNotifications };
}

export async function getUpcomingPaymentReminders(params: { ownerId?: string; today?: Date }): Promise<UpcomingReminder[]> {
  const { ownerId, today = new Date() } = params;
  const todayStart = startOfDay(today);

  const { db } = await connectToDatabase();

  const ownerFilter = ownerId
    ? ObjectId.isValid(ownerId)
      ? { $in: [ownerId, new ObjectId(ownerId)] }
      : ownerId
    : undefined;
  const activePropertyFilter = {
    $or: [
      { status: { $in: ["Active", "active"] } },
      { status: { $exists: false } },
    ],
  };
  const propertyFilter = ownerId ? { ownerId: ownerFilter, ...activePropertyFilter } : activePropertyFilter;
  const properties = await db.collection<Property>("properties").find(propertyFilter).toArray();

  if (properties.length === 0) {
    return [];
  }

  const propertyMap = new Map<string, Property>();
  const ownerIds = new Set<string>();
  for (const property of properties) {
    propertyMap.set(property._id.toString(), property);
    ownerIds.add(String(property.ownerId));
  }

  const tenantFilter: Record<string, unknown> = ownerId
    ? { ownerId: ownerFilter, status: "active" }
    : { ownerId: { $in: Array.from(ownerIds) }, status: "active" };

  const tenants = await db.collection<Tenant>("tenants").find(tenantFilter).toArray();

  if (tenants.length === 0) {
    return [];
  }

  const rentOverrideMap = await fetchActiveRentOverridesByPropertyIds(
    db,
    Array.from(propertyMap.keys())
  );
  const reminders: UpcomingReminder[] = [];

  for (const tenant of tenants) {
    const tenantId = tenant._id.toString();
    const property = propertyMap.get(String(tenant.propertyId));
    if (!property) continue;
    if (!isLeaseActiveOn(tenant, todayStart)) continue;

    const leaseStart = parseDate(tenant.leaseStartDate);
    const paymentDay = property.rentPaymentDate ?? (leaseStart ? businessDateParts(leaseStart).day : undefined);
    if (!paymentDay) continue;

    let dueDate = getNextDueDate(todayStart, paymentDay);
    if (leaseStart && dueDate < startOfDay(leaseStart)) {
      dueDate = getNextDueDate(startOfDay(leaseStart), paymentDay);
    }

    if (!isLeaseCoveringDate(tenant, dueDate)) continue;

    const reminderDate = addDays(dueDate, -5);

    const reminderType: ReminderType | null =
      isSameDay(todayStart, dueDate) ? "paymentDate" :
      isSameDay(todayStart, reminderDate) ? "fiveDaysBefore" :
      null;

    if (!reminderType) continue;

    const dueDateKey = toDateKey(dueDate);

    const existingReminder = await db.collection<ReminderNotification>("notifications").findOne({
      ownerId: String(property.ownerId),
      tenantId,
      type: "payment",
      reminderType,
      dueDate: dueDateKey,
    });

    if (existingReminder) {
      continue;
    }

    const state = await calculateTenantFinancialState(db, tenant, {
      asOf: endOfDay(dueDate),
      property,
      rentOverrideMap,
    });
    const amounts = calculateReminderDueAmounts({
      rentAmount: state.rentOutstanding,
      utilityAmount: state.utilitiesOutstanding,
      depositAmount: state.depositOutstanding,
      penaltiesAmount: state.penalties,
    });
    const { rentDue, utilityDue, depositDue, penaltiesDue, totalDue } = amounts;

    if (totalDue <= 0) {
      continue;
    }

    const formattedDueDate = dueDate.toLocaleDateString("en-US", {
      timeZone: "Africa/Nairobi",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    const unitLabel = (tenant.leasedUnits && tenant.leasedUnits.length > 0)
      ? tenant.leasedUnits.map((unit) => unit.houseNumber).filter(Boolean).join(", ")
      : tenant.houseNumber;
    const effectiveUnitLabel = unitLabel || "Unit";

    reminders.push({
      tenantId,
      tenantName: tenant.name,
      propertyName: property.name,
      houseNumber: effectiveUnitLabel,
      rentDue,
      utilityDue,
      depositDue,
      penaltiesDue,
      totalDue,
      dueDate: formattedDueDate,
      reminderType,
    });
  }

  return reminders;
}
