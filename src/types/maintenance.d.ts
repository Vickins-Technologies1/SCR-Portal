// src/types/maintenance.d.ts

export type MaintenanceUrgency = "low" | "medium" | "high";
export type MaintenanceStatus = "Pending" | "In Progress" | "Resolved";

export interface MaintenanceRequest {
  _id: string;
  title: string;
  description: string;
  status: MaintenanceStatus;
  urgency: MaintenanceUrgency;
  date: string; // ISO string
  propertyId: string;
  tenantId: string;

  // Optional fields (only present for property owners)
  tenantName?: string;
  ownerId?: string;
}