export type TenantDeletionStatus = "Pending" | "Approved" | "Rejected";

export interface TenantDeletionRequest {
  _id: string;
  tenantId: string;
  tenantName?: string;
  propertyId?: string;
  propertyName?: string;
  ownerId: string;
  requestedBy: string;
  requestedByName?: string;
  houseNumber?: string;
  unitType?: string;
  unitIdentifier?: string;
  status: TenantDeletionStatus;
  createdAt: string;
  updatedAt?: string;
  decisionNote?: string;
  decisionAt?: string;
}
