export type AirbnbStatus = "available" | "booked" | "blocked";

export interface AirbnbOverviewStats {
  todayCheckIns: number;
  todayCheckOuts: number;
  upcomingBookings: number;
  unreadMessages: number;
  monthlyRevenue: number;
  occupancyRate: number;
  adr: number;
  revpar: number;
}

export interface AirbnbCalendarNight {
  date: string;
  status: AirbnbStatus;
  rate: number;
  note?: string;
}

export interface AirbnbCalendarRow {
  propertyId: string;
  propertyName: string;
  nights: AirbnbCalendarNight[];
}

export interface AirbnbActivityItem {
  id: string;
  type: "booking" | "message" | "cleaning" | "compliance" | "payment";
  title: string;
  description: string;
  createdAt: string;
}

export interface AirbnbComplianceItem {
  propertyId: string;
  propertyName: string;
  ktraLicense: string;
  ktraExpiry: string;
  countyPermitExpiry: string;
  nemaExpiry: string;
  status: "compliant" | "due" | "overdue";
  nextAction: string;
}

export interface AirbnbOverview {
  stats: AirbnbOverviewStats;
  calendarPreview: AirbnbCalendarNight[];
  recentActivity: AirbnbActivityItem[];
  compliance: AirbnbComplianceItem[];
}

export interface AirbnbListing {
  id: string;
  name: string;
  location: string;
  status: "draft" | "published" | "paused";
  units: number;
  baseRate: number;
  weekendRate: number;
  occupancyRate: number;
  rating: number;
  reviewCount: number;
  lastSyncedAt: string;
  amenities: string[];
  houseRules: string[];
  licenseStatus: "valid" | "due" | "missing";
}

export interface AirbnbBooking {
  id: string;
  listingName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  total: number;
  status: "confirmed" | "pending" | "cancelled" | "modified";
  source: "Airbnb" | "Direct";
  payoutStatus: "pending" | "paid" | "failed";
  specialRequests?: string;
}

export interface AirbnbConversation {
  id: string;
  guestName: string;
  listingName: string;
  lastMessage: string;
  unread: number;
  channel: "Airbnb" | "In-app";
  lastMessageAt: string;
}

export interface AirbnbPricingRule {
  id: string;
  name: string;
  description: string;
  adjustment: string;
  active: boolean;
}

export interface AirbnbTask {
  id: string;
  title: string;
  propertyName: string;
  dueDate: string;
  assignedTo: string;
  status: "open" | "in_progress" | "done";
  checklist: string[];
}

export interface AirbnbPayout {
  id: string;
  propertyName: string;
  amount: number;
  period: string;
  status: "scheduled" | "processing" | "paid" | "failed";
  method: "M-Pesa" | "Bank";
}

export interface AirbnbIntegration {
  id: string;
  name: string;
  status: "connected" | "available" | "coming_soon";
  description: string;
}

export interface AirbnbReportSummary {
  occupancyRate: number;
  revenue: number;
  adr: number;
  revpar: number;
  cancellationRate: number;
  reviewScore: number;
}
