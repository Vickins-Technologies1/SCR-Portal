export type VacateRequestStatus = "Pending" | "Approved" | "Rejected";

export interface VacateRequest {
  _id: string;
  tenantId: string;
  tenantName?: string;
  propertyId: string;
  propertyName?: string;
  ownerId: string;
  houseNumber?: string;
  unitType?: string;
  message: string;
  requestedMoveOutDate?: string;
  status: VacateRequestStatus;
  createdAt: string;
  updatedAt?: string;
  decisionNote?: string;
  decisionAt?: string;
}
