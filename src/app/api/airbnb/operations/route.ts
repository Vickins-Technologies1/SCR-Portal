import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { resolveAirbnbOwner } from "@/lib/airbnb-auth";

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
