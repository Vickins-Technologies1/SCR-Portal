// src/lib/reminders.ts
import { ObjectId } from "mongodb";
import { connectToDatabase } from "./mongodb";
import { sendWelcomeSms } from "./sms";
import { sendWhatsAppMessage } from "./whatsapp";
import { sendReminderEmail } from "./email";
import logger from "./logger";
import { Property } from "../types/property";
import { Tenant } from "../types/tenant";

type ReminderType = "fiveDaysBefore" | "paymentDate";

interface Payment {
  tenantId: string;
  type: "Rent" | "Utility" | "Deposit" | string;
  status: "completed" | "pending" | "failed" | string;
  amount: number;
  paymentDate?: string;
}

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
  reminderType?: ReminderType;
  dueDate?: string;
  dueAmounts?: {
    rentDue: number;
    utilityDue: number;
    depositDue: number;
    totalDue: number;
  };
}

interface ReminderResult {
  sent: number;
  skipped: number;
  notifications: ReminderNotification[];
}

const UTILITY_AMOUNT = 1000;

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const endOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const getDueDateForMonth = (year: number, month: number, paymentDay: number) => {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const day = Math.min(Math.max(1, paymentDay), daysInMonth);
  return new Date(year, month, day);
};

const getNextDueDate = (today: Date, paymentDay: number) => {
  const todayStart = startOfDay(today);
  const dueThisMonth = getDueDateForMonth(todayStart.getFullYear(), todayStart.getMonth(), paymentDay);
  if (todayStart > dueThisMonth) {
    return getDueDateForMonth(todayStart.getFullYear(), todayStart.getMonth() + 1, paymentDay);
  }
  return dueThisMonth;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const buildReminderMessages = (
  reminderType: ReminderType,
  tenantName: string,
  propertyName: string,
  houseNumber: string,
  formattedDueDate: string,
  rentDue: number,
  utilityDue: number,
  depositDue: number,
  totalDue: number
) => {
  const shortTotal = totalDue.toFixed(2);
  const smsMessage =
    reminderType === "fiveDaysBefore"
      ? `Reminder: Ksh ${shortTotal} due by ${formattedDueDate} for ${propertyName} (${houseNumber}).`
      : `Payment due today: Ksh ${shortTotal} for ${propertyName} (${houseNumber}).`;

  const whatsappMessage =
    `Hello ${tenantName},\n\n` +
    (reminderType === "fiveDaysBefore"
      ? `Your payment for ${propertyName} is due on ${formattedDueDate}.`
      : `Your payment for ${propertyName} is due today.`) +
    `\n\nBreakdown:\n` +
    `Rent: Ksh ${rentDue.toFixed(2)}\n` +
    `Utilities: Ksh ${utilityDue.toFixed(2)}\n` +
    `Deposit: Ksh ${depositDue.toFixed(2)}\n` +
    `Total Due: Ksh ${totalDue.toFixed(2)}\n` +
    `Unit: ${houseNumber}\n\n` +
    `Please make payment on time. Thank you.`;

  const appMessage =
    reminderType === "fiveDaysBefore"
      ? `Payment reminder: Ksh ${shortTotal} due by ${formattedDueDate} for ${propertyName} (${houseNumber}).`
      : `Payment due today: Ksh ${shortTotal} for ${propertyName} (${houseNumber}).`;

  return { smsMessage, whatsappMessage, appMessage };
};

export async function sendPaymentReminders(params: { ownerId?: string; today?: Date }): Promise<ReminderResult> {
  const { ownerId, today = new Date() } = params;
  const todayStart = startOfDay(today);

  const { db } = await connectToDatabase();

  const propertyFilter = ownerId ? { ownerId } : {};
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
    ? { ownerId, status: "active" }
    : { ownerId: { $in: Array.from(ownerIds) }, status: "active" };

  const tenants = await db.collection<Tenant>("tenants").find(tenantFilter).toArray();

  if (tenants.length === 0) {
    return { sent: 0, skipped: 0, notifications: [] };
  }

  const tenantIds = tenants.map((tenant) => tenant._id.toString());
  const payments = await db.collection<Payment>("payments").find({
    tenantId: { $in: tenantIds },
    status: "completed",
  }).toArray();

  const paymentsByTenant = new Map<string, Payment[]>();
  for (const payment of payments) {
    const key = (payment.tenantId as any)?.toString?.() ?? payment.tenantId;
    if (!key) continue;
    const list = paymentsByTenant.get(key) ?? [];
    list.push(payment);
    paymentsByTenant.set(key, list);
  }

  let sent = 0;
  let skipped = 0;
  const createdNotifications: ReminderNotification[] = [];

  for (const tenant of tenants) {
    const tenantId = tenant._id.toString();
    const property = propertyMap.get(tenant.propertyId);
    if (!property || !property.rentPaymentDate) continue;

    const dueDate = getNextDueDate(todayStart, property.rentPaymentDate);
    const reminderDate = addDays(dueDate, -5);

    const reminderType: ReminderType | null =
      isSameDay(todayStart, dueDate) ? "paymentDate" :
      isSameDay(todayStart, reminderDate) ? "fiveDaysBefore" :
      null;

    if (!reminderType) continue;

    const dueDateKey = dueDate.toISOString().slice(0, 10);

    const existingReminder = await db.collection<ReminderNotification>("notifications").findOne({
      ownerId: String(property.ownerId),
      tenantId,
      type: "payment",
      reminderType,
      dueDate: dueDateKey,
    });

    if (existingReminder) {
      skipped += 1;
      continue;
    }

    const unitKey = tenant.unitIdentifier || tenant.unitType;
    const unitConfig = property.unitTypes.find((unit) =>
      unit.uniqueType === unitKey || unit.type === unitKey
    );

    const rentAmount = unitConfig?.price ?? tenant.price;
    const depositAmount = unitConfig?.deposit ?? tenant.deposit ?? 0;

    const rangeStart = new Date(dueDate.getFullYear(), dueDate.getMonth(), 1);
    const rangeEnd = endOfDay(new Date(dueDate.getFullYear(), dueDate.getMonth() + 1, 0));

    const tenantPayments = paymentsByTenant.get(tenantId) ?? [];

    const rentPaid = tenantPayments
      .filter((payment) => payment.type === "Rent")
      .filter((payment) => {
        const paidAt = parseDate(payment.paymentDate);
        return !!paidAt && paidAt >= rangeStart && paidAt <= rangeEnd;
      })
      .reduce((sum, payment) => sum + payment.amount, 0);

    const utilityPaid = tenantPayments
      .filter((payment) => payment.type === "Utility")
      .filter((payment) => {
        const paidAt = parseDate(payment.paymentDate);
        return !!paidAt && paidAt >= rangeStart && paidAt <= rangeEnd;
      })
      .reduce((sum, payment) => sum + payment.amount, 0);

    const depositPaid = tenantPayments
      .filter((payment) => payment.type === "Deposit")
      .reduce((sum, payment) => sum + payment.amount, 0);

    const rentDue = Math.max(0, rentAmount - rentPaid);
    const utilityDue = Math.max(0, UTILITY_AMOUNT - utilityPaid);
    const depositDue = Math.max(0, depositAmount - depositPaid);
    const totalDue = rentDue + utilityDue + depositDue;

    if (totalDue <= 0) {
      skipped += 1;
      continue;
    }

    const formattedDueDate = dueDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const { smsMessage, whatsappMessage, appMessage } = buildReminderMessages(
      reminderType,
      tenant.name,
      property.name,
      tenant.houseNumber,
      formattedDueDate,
      rentDue,
      utilityDue,
      depositDue,
      totalDue
    );

    const deliveryMethod = tenant.deliveryMethod || "both";
    let deliveryStatus: ReminderNotification["deliveryStatus"] = deliveryMethod === "app" ? "success" : "pending";
    let errorDetails: string | null = null;

    const recordFailure = (detail: string) => {
      deliveryStatus = "failed";
      errorDetails = errorDetails ? `${errorDetails}; ${detail}` : detail;
    };

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
      deliveryStatus,
      errorDetails,
      reminderType,
      dueDate: dueDateKey,
      dueAmounts: {
        rentDue,
        utilityDue,
        depositDue,
        totalDue,
      },
    };

    await db.collection<ReminderNotification>("notifications").insertOne(newNotification);
    createdNotifications.push(newNotification);
    sent += 1;
  }

  return { sent, skipped, notifications: createdNotifications };
}
