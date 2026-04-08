import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";
import { buildInvalidCsrfResponse, validateCsrfToken } from "@/lib/csrf";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const requestedOwnerId = searchParams.get("ownerId");

  const resolved = await resolveAirbnbOwner(request, requestedOwnerId);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  const { db } = await connectToDatabase();

  const tasks = await db
    .collection("airbnbTasks")
    .find({ ownerId })
    .sort({ dueDate: 1 })
    .toArray();

  return NextResponse.json({
    success: true,
    tasks: tasks.map((task) => ({
      id: task.externalId || task._id?.toString?.() || "",
      title: task.title,
      propertyName: task.propertyName,
      dueDate: task.dueDate,
      assignedTo: task.assignedTo,
      status: task.status,
      checklist: task.checklist || [],
    })),
  });
}

const TaskSchema = z.object({
  title: z.string().trim().min(3),
  propertyName: z.string().trim().min(2),
  dueDate: z.string().trim().min(4),
  assignedTo: z.string().trim().min(2),
  checklist: z.array(z.string().trim().min(1)).optional(),
});

export async function POST(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = TaskSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid task payload" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const taskDoc = {
    ownerId,
    externalId: `task-${new ObjectId().toString()}`,
    title: parsed.data.title,
    propertyName: parsed.data.propertyName,
    dueDate: parsed.data.dueDate,
    assignedTo: parsed.data.assignedTo,
    status: "open",
    checklist: parsed.data.checklist || [],
    createdAt: now,
    updatedAt: now,
  };

  const { db } = await connectToDatabase();
  await db.collection("airbnbTasks").insertOne(taskDoc);

  return NextResponse.json({
    success: true,
    task: {
      id: taskDoc.externalId,
      title: taskDoc.title,
      propertyName: taskDoc.propertyName,
      dueDate: taskDoc.dueDate,
      assignedTo: taskDoc.assignedTo,
      status: taskDoc.status,
      checklist: taskDoc.checklist,
    },
  });
}

const TaskUpdateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["open", "in_progress", "done"]).optional(),
});

export async function PATCH(request: NextRequest) {
  const csrfToken = request.headers.get("x-csrf-token");
  if (!validateCsrfToken(request, csrfToken)) {
    return buildInvalidCsrfResponse(request);
  }

  const resolved = await resolveAirbnbOwner(request, null);
  if (resolved.response) return resolved.response;
  const { ownerId } = resolved.context!;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON payload" }, { status: 400 });
  }

  const parsed = TaskUpdateSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid update payload" }, { status: 400 });
  }

  const filter = ObjectId.isValid(parsed.data.id)
    ? { _id: new ObjectId(parsed.data.id), ownerId }
    : { externalId: parsed.data.id, ownerId };

  const { db } = await connectToDatabase();
  const result = await db.collection("airbnbTasks").findOneAndUpdate(
    filter,
    { $set: { status: parsed.data.status, updatedAt: new Date().toISOString() } },
    { returnDocument: "after" }
  );

  const updated = result?.value;
  if (!updated) {
    return NextResponse.json({ success: false, message: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    task: {
      id: updated.externalId || updated._id?.toString?.() || "",
      title: updated.title,
      propertyName: updated.propertyName,
      dueDate: updated.dueDate,
      assignedTo: updated.assignedTo,
      status: updated.status,
      checklist: updated.checklist || [],
    },
  });
}
