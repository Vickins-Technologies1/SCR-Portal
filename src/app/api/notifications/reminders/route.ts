import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { connectToDatabase } from '../../../../lib/mongodb';
import { sendWelcomeSms } from '../../../../lib/sms';
import { sendReminderEmail } from '../../../../lib/email';
import { ObjectId, Db } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { Notification } from '../../../../types/notification';
import { Tenant } from '../../../../types/tenant';

interface LogMeta {
  [key: string]: unknown;
}

interface Property {
  _id: ObjectId;
  ownerId: string;
  name: string;
  rentPaymentDate: number;
  unitTypes: Array<{ type: string; price: number }>;
}

interface Payment {
  _id: ObjectId;
  tenantId: string;
  amount: number;
  propertyId: string;
  paymentDate: string;
  transactionId: string;
  status: "completed" | "pending" | "failed";
  createdAt: string;
  type?: "Rent" | "Utility" | "Deposit" | "Other";
}

const logger = {
  debug: (message: string, meta?: LogMeta) => {
    if (process.env.NODE_ENV !== "production") {
      console.debug(`[DEBUG] ${message}`, meta || "");
    }
  },
  warn: (message: string, meta?: LogMeta) => {
    console.warn(`[WARN] ${message}`, meta || "");
  },
  error: (message: string, meta?: LogMeta) => {
    console.error(`[ERROR] ${message}`, meta || "");
  },
  info: (message: string, meta?: LogMeta) => {
    console.info(`[INFO] ${message}`, meta || "");
  },
};

const isReminderDay = (rentPaymentDate: number, currentDate: Date): "fiveDaysBefore" | "paymentDate" | null => {
  const today = currentDate.getDate();
  const fiveDaysBefore = rentPaymentDate - 5;
  const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();
  const adjustedFiveDaysBefore = fiveDaysBefore <= 0 ? fiveDaysBefore + daysInMonth : fiveDaysBefore;

  if (today === rentPaymentDate) {
    return "paymentDate";
  }
  if (today === adjustedFiveDaysBefore) {
    return "fiveDaysBefore";
  }
  return null;
};

const calculateDuePayments = async (
  db: Db,
  tenant: Tenant,
  property: Property,
  currentDate: Date
): Promise<{ rentDue: number; utilityDue: number; depositDue: number; totalDue: number }> => {
  const leaseStartDate = new Date(tenant.leaseStartDate);
  if (leaseStartDate > currentDate) {
    logger.debug("Lease not started for tenant", {
      tenantId: tenant._id.toString(),
      tenantName: tenant.name,
      leaseStartDate: tenant.leaseStartDate,
      currentDate: currentDate.toISOString(),
    });
    return { rentDue: 0, utilityDue: 0, depositDue: 0, totalDue: 0 };
  }

  const unit = property.unitTypes.find((u) => u.type === tenant.unitType);
  const rentAmount = unit ? unit.price : tenant.price;
  const depositAmount = tenant.deposit || 0;
  const utilityAmount = 1000;

  const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

  const payments = await db
    .collection<Payment>("payments")
    .find({
      tenantId: tenant._id.toString(),
      propertyId: property._id.toString(),
      status: "completed",
      type: { $in: ["Rent", "Utility", "Deposit"] },
      $or: [
        { type: { $in: ["Rent", "Utility"] }, paymentDate: { $gte: startOfMonth.toISOString(), $lte: endOfMonth.toISOString() } },
        { type: "Deposit" },
      ],
    })
    .toArray();

  const rentPayments = payments
    .filter((p) => p.type === "Rent")
    .reduce((sum, p) => sum + p.amount, 0);
  const utilityPayments = payments
    .filter((p) => p.type === "Utility")
    .reduce((sum, p) => sum + p.amount, 0);
  const depositPayments = payments
    .filter((p) => p.type === "Deposit")
    .reduce((sum, p) => sum + p.amount, 0);

  const rentDue = Math.max(0, rentAmount - rentPayments);
  const utilityDue = Math.max(0, utilityAmount - utilityPayments);
  const depositDue = Math.max(0, depositAmount - depositPayments);
  const totalDue = rentDue + utilityDue + depositDue;

  logger.debug("Calculated due payments", {
    tenantId: tenant._id.toString(),
    tenantName: tenant.name,
    rentAmount,
    rentPayments,
    rentDue,
    utilityAmount,
    utilityPayments,
    utilityDue,
    depositAmount,
    depositPayments,
    depositDue,
    totalDue,
  });

  return { rentDue, utilityDue, depositDue, totalDue };
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ownerId = searchParams.get('ownerId');

    logger.debug('GET /api/properties - Query params', { ownerId });

    if (!ownerId || !ObjectId.isValid(ownerId)) {
      logger.warn('Invalid or missing owner ID', { ownerId });
      return NextResponse.json(
        { success: false, message: 'Valid owner ID is required' },
        { status: 400 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();
    logger.debug('Connected to database', { database: 'rentaldb', collection: 'properties' });

    const properties = await db
      .collection<Property>('properties')
      .find({ ownerId })
      .toArray();

    logger.debug('Fetched properties', { ownerId, count: properties.length });

    return NextResponse.json(
      { success: true, properties },
      { status: 200 }
    );
  } catch (error: unknown) {
    logger.error('Error in GET /api/properties', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("userId")?.value;
    const role = cookieStore.get("role")?.value;
    logger.debug("POST /api/notifications/reminders - Cookies", { userId, role });

    if (!userId || !ObjectId.isValid(userId)) {
      logger.warn("Invalid or missing user ID", { userId });
      return NextResponse.json(
        { success: false, message: "Valid user ID is required" },
        { status: 400 }
      );
    }

    if (role !== "propertyOwner") {
      logger.warn("Unauthorized access attempt", { role });
      return NextResponse.json(
        { success: false, message: "Unauthorized. Please log in as a property owner." },
        { status: 401 }
      );
    }

    const { db }: { db: Db } = await connectToDatabase();
    logger.debug("Connected to database", { database: "rentaldb", collections: ["properties", "tenants", "notifications", "payments"] });

    const currentDate = new Date("2025-08-14T15:49:00+03:00");
    logger.debug("Current date for reminder check", { date: currentDate.toISOString() });

    const properties = await db
      .collection<Property>("properties")
      .find({ ownerId: userId })
      .toArray();
    logger.debug("Fetched properties", { userId, count: properties.length });

    if (!properties.length) {
      logger.warn("No properties found for user", { userId });
      return NextResponse.json(
        { success: false, message: "No properties found for the user" },
        { status: 404 }
      );
    }

    let sentReminders = 0;
    const failedReminders: string[] = [];

    for (const property of properties) {
      const reminderType = isReminderDay(property.rentPaymentDate, currentDate);
      if (!reminderType) {
        logger.debug("No reminder needed for property", {
          propertyId: property._id.toString(),
          propertyName: property.name,
          rentPaymentDate: property.rentPaymentDate,
          currentDate: currentDate.getDate(),
        });
        continue;
      }

      const tenants = await db
        .collection<Tenant>("tenants")
        .find({ propertyId: property._id.toString(), ownerId: userId })
        .toArray();
      logger.debug("Fetched tenants for property", {
        propertyId: property._id.toString(),
        propertyName: property.name,
        tenantCount: tenants.length,
      });

      if (!tenants.length) {
        logger.debug("No tenants found for property", {
          propertyId: property._id.toString(),
          propertyName: property.name,
        });
        continue;
      }

      const dueDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), property.rentPaymentDate);
      const formattedDueDate = dueDate.toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });

      for (const tenant of tenants) {
        const leaseStartDate = new Date(tenant.leaseStartDate);
        if (leaseStartDate > currentDate) {
          logger.debug("Skipping tenant with future lease start date", {
            tenantId: tenant._id.toString(),
            tenantName: tenant.name,
            leaseStartDate: tenant.leaseStartDate,
          });
          continue;
        }

        const startOfDay = new Date(currentDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(currentDate);
        endOfDay.setHours(23, 59, 59, 999);

        const existingNotification = await db.collection<Notification>("notifications").findOne({
          tenantId: tenant._id.toString(),
          type: "payment",
          createdAt: { $gte: startOfDay.toISOString(), $lte: endOfDay.toISOString() },
        });
        if (existingNotification) {
          logger.debug("Skipping duplicate reminder", {
            tenantId: tenant._id.toString(),
            tenantName: tenant.name,
            reminderType,
          });
          continue;
        }

        const { rentDue, utilityDue, depositDue, totalDue } = await calculateDuePayments(db, tenant, property, currentDate);

        if (totalDue <= 0) {
          logger.debug("No payments due for tenant", {
            tenantId: tenant._id.toString(),
            tenantName: tenant.name,
            rentDue,
            utilityDue,
            depositDue,
          });
          continue;
        }

        const messageItems = [
          rentDue > 0 ? `Rent: Ksh. ${rentDue.toFixed(2)}` : "",
          utilityDue > 0 ? `Utilities: Ksh. ${utilityDue.toFixed(2)}` : "",
          depositDue > 0 ? `Deposit: Ksh. ${depositDue.toFixed(2)}` : "",
        ].filter(Boolean);
        const message =
          reminderType === "fiveDaysBefore"
            ? `Reminder: Payment of ${messageItems.join(", ")} (Total: Ksh. ${totalDue.toFixed(2)}) for ${property.name} is due on ${formattedDueDate}.`
            : `Today is the due date for ${property.name}. Pay ${messageItems.join(", ")} (Total: Ksh. ${totalDue.toFixed(2)}).`;

        const notification: Notification = {
          _id: uuidv4(),
          message,
          type: "payment",
          createdAt: currentDate.toISOString(),
          status: "unread",
          tenantId: tenant._id.toString(),
          tenantName: tenant.name,
          ownerId: userId,
          deliveryMethod: tenant.deliveryMethod || "app",
          deliveryStatus: "pending",
        };

        let smsSuccess = true;
        let emailSuccess = true;

        if (["sms", "both"].includes(tenant.deliveryMethod) && tenant.phone) {
          try {
            const smsMessage = message.slice(0, 160);
            await sendWelcomeSms({
              phone: tenant.phone,
              message: smsMessage,
            });
            logger.info("Rent reminder SMS sent successfully", {
              tenantId: tenant._id.toString(),
              tenantName: tenant.name,
              phone: tenant.phone,
              propertyId: property._id.toString(),
              reminderType,
              totalDue,
            });
            notification.deliveryStatus = "success";
          } catch (smsError) {
            logger.error("Failed to send rent reminder SMS", {
              tenantId: tenant._id.toString(),
              tenantName: tenant.name,
              phone: tenant.phone,
              propertyId: property._id.toString(),
              error: smsError instanceof Error ? smsError.message : "Unknown error",
            });
            smsSuccess = false;
            notification.deliveryStatus = "failed";
            failedReminders.push(`SMS to ${tenant.name} (${tenant.phone})`);
          }
        }

        if (["email", "both"].includes(tenant.deliveryMethod) && tenant.email) {
          try {
            await sendReminderEmail({
              to: tenant.email,
              name: tenant.name,
              propertyName: property.name,
              houseNumber: tenant.houseNumber, // No fallback needed, houseNumber is string
              rentDue,
              utilityDue,
              depositDue,
              totalDue,
              dueDate: formattedDueDate,
              reminderType,
            });
            logger.info("Rent reminder email sent successfully", {
              tenantId: tenant._id.toString(),
              tenantName: tenant.name,
              email: tenant.email,
              propertyId: property._id.toString(),
              reminderType,
              totalDue,
            });
            notification.deliveryStatus = smsSuccess ? "success" : "failed";
          } catch (emailError) {
            logger.error("Failed to send rent reminder email", {
              tenantId: tenant._id.toString(),
              tenantName: tenant.name,
              email: tenant.email,
              propertyId: property._id.toString(),
              error: emailError instanceof Error ? emailError.message : "Unknown error",
            });
            emailSuccess = false;
            notification.deliveryStatus = "failed";
            failedReminders.push(`Email to ${tenant.name} (${tenant.email})`);
          }
        }

        if (["sms", "email", "both"].includes(tenant.deliveryMethod)) {
          notification.deliveryStatus = smsSuccess && emailSuccess ? "success" : "failed";
        } else {
          notification.deliveryStatus = "success";
        }

        await db.collection<Notification>("notifications").insertOne(notification);
        logger.debug("Notification recorded", {
          notificationId: notification._id,
          tenantId: tenant._id.toString(),
          propertyId: property._id.toString(),
          reminderType,
          totalDue,
        });

        sentReminders++;
      }
    }

    logger.info("POST /api/notifications/reminders completed", {
      sentReminders,
      failedReminders: failedReminders.length,
    });

    if (sentReminders === 0) {
      return NextResponse.json(
        { success: true, message: "No reminders needed for today", sentReminders: 0 },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: `Sent ${sentReminders} rent reminder(s)${failedReminders.length > 0 ? `, with ${failedReminders.length} failure(s): ${failedReminders.join(", ")}` : ""}`,
        sentReminders,
        failedReminders,
      },
      { status: 201 }
    );
  } catch (error: unknown) {
    logger.error("Error in POST /api/notifications/reminders", {
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}