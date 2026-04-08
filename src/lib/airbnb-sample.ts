import {
  AirbnbActivityItem,
  AirbnbBooking,
  AirbnbCalendarNight,
  AirbnbCalendarRow,
  AirbnbComplianceItem,
  AirbnbConversation,
  AirbnbIntegration,
  AirbnbListing,
  AirbnbOverview,
  AirbnbPricingRule,
  AirbnbPayout,
  AirbnbReportSummary,
  AirbnbTask,
} from "@/types/airbnb";
import { calculateAdr, calculateOccupancyRate, calculateRevpar } from "./airbnb-metrics";

const toIso = (date: Date) => date.toISOString();

const addDays = (base: Date, days: number) => {
  const next = new Date(base);
  next.setDate(base.getDate() + days);
  return next;
};

const sampleListings: AirbnbListing[] = [
  {
    id: "lst-1",
    name: "Skyline Studio - Westlands",
    location: "Nairobi, Westlands",
    status: "published",
    units: 3,
    baseRate: 6200,
    weekendRate: 7400,
    occupancyRate: 82,
    rating: 4.8,
    reviewCount: 128,
    lastSyncedAt: toIso(addDays(new Date(), -1)),
    amenities: ["Fiber Wi-Fi", "Smart TV", "Backup power", "Kitchenette"],
    houseRules: ["No parties", "Quiet hours after 10pm", "ID required"],
    licenseStatus: "valid",
  },
  {
    id: "lst-2",
    name: "Coastal Escape Villa",
    location: "Mombasa, Nyali",
    status: "published",
    units: 1,
    baseRate: 15500,
    weekendRate: 18500,
    occupancyRate: 74,
    rating: 4.7,
    reviewCount: 86,
    lastSyncedAt: toIso(addDays(new Date(), -2)),
    amenities: ["Pool", "Chef on request", "Ocean view", "Airport pickup"],
    houseRules: ["No pets", "Check-in after 2pm", "ID required"],
    licenseStatus: "due",
  },
  {
    id: "lst-3",
    name: "Safari Gateway Suites",
    location: "Nanyuki, Laikipia",
    status: "paused",
    units: 4,
    baseRate: 9800,
    weekendRate: 11200,
    occupancyRate: 61,
    rating: 4.6,
    reviewCount: 54,
    lastSyncedAt: toIso(addDays(new Date(), -4)),
    amenities: ["Game drive partner", "Fireplace", "Private patio"],
    houseRules: ["No smoking indoors", "Respect wildlife", "ID required"],
    licenseStatus: "missing",
  },
];

const sampleBookings: AirbnbBooking[] = [
  {
    id: "bk-1",
    listingName: "Skyline Studio - Westlands",
    guestName: "Aisha Kamau",
    checkIn: toIso(addDays(new Date(), 0)),
    checkOut: toIso(addDays(new Date(), 2)),
    nights: 2,
    total: 13800,
    status: "confirmed",
    source: "Airbnb",
    payoutStatus: "pending",
    specialRequests: "Early check-in if possible",
  },
  {
    id: "bk-2",
    listingName: "Coastal Escape Villa",
    guestName: "Michael Rivera",
    checkIn: toIso(addDays(new Date(), 1)),
    checkOut: toIso(addDays(new Date(), 5)),
    nights: 4,
    total: 72000,
    status: "pending",
    source: "Airbnb",
    payoutStatus: "pending",
  },
  {
    id: "bk-3",
    listingName: "Safari Gateway Suites",
    guestName: "Linet Achieng",
    checkIn: toIso(addDays(new Date(), -1)),
    checkOut: toIso(addDays(new Date(), 1)),
    nights: 2,
    total: 20800,
    status: "modified",
    source: "Direct",
    payoutStatus: "paid",
  },
];

const sampleConversations: AirbnbConversation[] = [
  {
    id: "msg-1",
    guestName: "Aisha Kamau",
    listingName: "Skyline Studio - Westlands",
    lastMessage: "Landing at JKIA at 7pm, can I check in at 8pm?",
    unread: 2,
    channel: "Airbnb",
    lastMessageAt: toIso(addDays(new Date(), 0)),
  },
  {
    id: "msg-2",
    guestName: "Michael Rivera",
    listingName: "Coastal Escape Villa",
    lastMessage: "Do you provide airport pickup?",
    unread: 1,
    channel: "Airbnb",
    lastMessageAt: toIso(addDays(new Date(), -1)),
  },
  {
    id: "msg-3",
    guestName: "Linet Achieng",
    listingName: "Safari Gateway Suites",
    lastMessage: "Thanks! Will leave keys at the lockbox.",
    unread: 0,
    channel: "In-app",
    lastMessageAt: toIso(addDays(new Date(), -2)),
  },
];

const sampleTasks: AirbnbTask[] = [
  {
    id: "task-1",
    title: "Turnover cleaning",
    propertyName: "Skyline Studio - Westlands",
    dueDate: toIso(addDays(new Date(), 0)),
    assignedTo: "Rose (Cleaner)",
    status: "in_progress",
    checklist: ["Linen change", "Bathroom sanitation", "Restock toiletries"],
  },
  {
    id: "task-2",
    title: "Pool maintenance",
    propertyName: "Coastal Escape Villa",
    dueDate: toIso(addDays(new Date(), 1)),
    assignedTo: "Kwame (Tech)",
    status: "open",
    checklist: ["Water test", "Filter backwash", "Chemical balance"],
  },
  {
    id: "task-3",
    title: "Safety inspection",
    propertyName: "Safari Gateway Suites",
    dueDate: toIso(addDays(new Date(), 2)),
    assignedTo: "Maya (Ops)",
    status: "done",
    checklist: ["Fire extinguisher", "Smoke alarm", "First aid kit"],
  },
];

const sampleCompliance: AirbnbComplianceItem[] = [
  {
    propertyId: "lst-1",
    propertyName: "Skyline Studio - Westlands",
    ktraLicense: "KTRA-2025-4481",
    ktraExpiry: toIso(addDays(new Date(), 120)),
    countyPermitExpiry: toIso(addDays(new Date(), 95)),
    nemaExpiry: toIso(addDays(new Date(), 240)),
    status: "compliant",
    nextAction: "Schedule annual health clearance in 90 days",
  },
  {
    propertyId: "lst-2",
    propertyName: "Coastal Escape Villa",
    ktraLicense: "KTRA-2024-8821",
    ktraExpiry: toIso(addDays(new Date(), 18)),
    countyPermitExpiry: toIso(addDays(new Date(), 25)),
    nemaExpiry: toIso(addDays(new Date(), 40)),
    status: "due",
    nextAction: "Renew KTRA license and county permit",
  },
  {
    propertyId: "lst-3",
    propertyName: "Safari Gateway Suites",
    ktraLicense: "Pending",
    ktraExpiry: toIso(addDays(new Date(), -12)),
    countyPermitExpiry: toIso(addDays(new Date(), -4)),
    nemaExpiry: toIso(addDays(new Date(), 10)),
    status: "overdue",
    nextAction: "Submit license documents and pay Tourism Levy",
  },
];

const sampleCalendarPreview = (base: Date): AirbnbCalendarNight[] =>
  Array.from({ length: 7 }).map((_, index) => {
    const date = addDays(base, index);
    const status = index === 1 || index === 2 ? "booked" : index === 4 ? "blocked" : "available";
    return {
      date: toIso(date),
      status,
      rate: status === "available" ? 6200 + index * 150 : 0,
      note: status === "blocked" ? "Owner stay" : undefined,
    };
  });

const sampleCalendarRows = (base: Date): AirbnbCalendarRow[] => {
  const nights = Array.from({ length: 14 }).map((_, index) => {
    const date = addDays(base, index);
    const status: AirbnbCalendarNight["status"] =
      index % 6 === 0 ? "blocked" : index % 4 === 0 ? "booked" : "available";
    return {
      date: toIso(date),
      status,
      rate: status === "available" ? 6000 + index * 120 : 0,
    };
  });

  return sampleListings.map((listing, index) => ({
    propertyId: listing.id,
    propertyName: listing.name,
    nights: nights.map((night, nightIndex) => ({
      ...night,
      rate: night.status === "available" ? listing.baseRate + nightIndex * 90 : 0,
    })),
  }));
};

export function getSampleAirbnbOverview(): AirbnbOverview {
  const now = new Date();
  const monthlyRevenue = 980000;
  const bookedNights = 214;
  const availableNights = 290;

  const stats = {
    todayCheckIns: 4,
    todayCheckOuts: 3,
    upcomingBookings: 16,
    unreadMessages: 7,
    monthlyRevenue,
    occupancyRate: calculateOccupancyRate(bookedNights, availableNights),
    adr: calculateAdr(monthlyRevenue, bookedNights),
    revpar: calculateRevpar(monthlyRevenue, availableNights),
  };

  const recentActivity: AirbnbActivityItem[] = [
    {
      id: "act-1",
      type: "booking",
      title: "New booking confirmed",
      description: "Aisha Kamau booked Skyline Studio (2 nights).",
      createdAt: toIso(addDays(now, 0)),
    },
    {
      id: "act-2",
      type: "cleaning",
      title: "Cleaning task assigned",
      description: "Turnover cleaning scheduled for 1:00 PM.",
      createdAt: toIso(addDays(now, 0)),
    },
    {
      id: "act-3",
      type: "payment",
      title: "Airbnb payout received",
      description: "KES 184,500 deposited for March stays.",
      createdAt: toIso(addDays(now, -1)),
    },
    {
      id: "act-4",
      type: "compliance",
      title: "License renewal due",
      description: "Coastal Escape Villa KTRA license expires in 18 days.",
      createdAt: toIso(addDays(now, -2)),
    },
  ];

  return {
    stats,
    calendarPreview: sampleCalendarPreview(now),
    recentActivity,
    compliance: sampleCompliance,
  };
}

export function getSampleAirbnbListings(): AirbnbListing[] {
  return sampleListings;
}

export function getSampleAirbnbBookings(): AirbnbBooking[] {
  return sampleBookings;
}

export function getSampleAirbnbConversations(): AirbnbConversation[] {
  return sampleConversations;
}

export function getSampleAirbnbCalendar(): AirbnbCalendarRow[] {
  return sampleCalendarRows(new Date());
}

export function getSampleAirbnbPricingRules(): AirbnbPricingRule[] {
  return [
    {
      id: "rule-1",
      name: "High season uplift",
      description: "Apply +18% for July to September safari season.",
      adjustment: "+18%",
      active: true,
    },
    {
      id: "rule-2",
      name: "Last-minute boost",
      description: "Increase rates +10% when occupancy > 80%.",
      adjustment: "+10%",
      active: true,
    },
    {
      id: "rule-3",
      name: "Long stay discount",
      description: "7+ nights receive 12% discount.",
      adjustment: "-12%",
      active: true,
    },
  ];
}

export function getSampleAirbnbTasks(): AirbnbTask[] {
  return sampleTasks;
}

export function getSampleAirbnbPayouts(): AirbnbPayout[] {
  return [
    {
      id: "pay-1",
      propertyName: "Skyline Studio - Westlands",
      amount: 214000,
      period: "Mar 1 - Mar 15",
      status: "processing",
      method: "M-Pesa",
    },
    {
      id: "pay-2",
      propertyName: "Coastal Escape Villa",
      amount: 364000,
      period: "Mar 1 - Mar 15",
      status: "scheduled",
      method: "Bank",
    },
    {
      id: "pay-3",
      propertyName: "Safari Gateway Suites",
      amount: 128000,
      period: "Feb 16 - Feb 29",
      status: "paid",
      method: "M-Pesa",
    },
  ];
}

export function getSampleAirbnbIntegrations(): AirbnbIntegration[] {
  return [
    {
      id: "int-1",
      name: "Airbnb Channel Manager API",
      status: "connected",
      description: "Two-way sync for listings, calendar, rates, and messaging.",
    },
    {
      id: "int-2",
      name: "M-Pesa (Daraja)",
      status: "connected",
      description: "C2B guest payments and B2C host payouts in KES.",
    },
    {
      id: "int-3",
      name: "WhatsApp + SMS",
      status: "connected",
      description: "Automated guest messaging and ops alerts.",
    },
    {
      id: "int-4",
      name: "Smart Lock API",
      status: "available",
      description: "Provision time-bound access codes for guests.",
    },
    {
      id: "int-5",
      name: "Booking.com",
      status: "coming_soon",
      description: "Future channel expansion with unified calendar sync.",
    },
  ];
}

export function getSampleAirbnbReports(): AirbnbReportSummary {
  return {
    occupancyRate: 78,
    revenue: 1825000,
    adr: 7200,
    revpar: 5600,
    cancellationRate: 4.2,
    reviewScore: 4.75,
  };
}

export function getSampleAirbnbCompliance(): AirbnbComplianceItem[] {
  return sampleCompliance;
}
