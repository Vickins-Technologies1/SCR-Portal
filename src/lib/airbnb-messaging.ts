export type AirbnbTemplateKey =
  | "welcome"
  | "checkin"
  | "midstay"
  | "checkout"
  | "review";

export const AIRBNB_MESSAGE_TEMPLATES = [
  {
    id: "welcome",
    title: "Welcome message",
    body:
      "Hi {name}, karibu Sorana! Your stay at {listingName} is confirmed. Check-in is {checkInDate} after {checkInTime}. Let us know if you need anything.",
    language: "en",
  },
  {
    id: "checkin",
    title: "Check-in instructions",
    body:
      "Hello {name}, your check-in for {listingName} is today. The lockbox code is {accessCode}. Wi-Fi: {wifiName} / {wifiPassword}. Safe travels!",
    language: "en",
  },
  {
    id: "midstay",
    title: "Mid-stay check-in",
    body:
      "Hi {name}, just checking in to make sure everything at {listingName} is perfect. Reply here if you need anything.",
    language: "en",
  },
  {
    id: "checkout",
    title: "Checkout reminder",
    body:
      "Habari {name}, checkout at {listingName} is {checkOutDate} by {checkOutTime}. Please ensure keys are returned and lights are off. Asante!",
    language: "sw",
  },
  {
    id: "review",
    title: "Review request",
    body:
      "Hi {name}, we hope you enjoyed {listingName}! If you have a minute, please leave a review. It helps us a lot. Thank you!",
    language: "en",
  },
] as const;

export type AirbnbTemplate = (typeof AIRBNB_MESSAGE_TEMPLATES)[number];

export type AirbnbTemplateVariables = Record<string, string | number | null | undefined>;

export const renderAirbnbTemplate = (
  templateBody: string,
  variables: AirbnbTemplateVariables
): string => {
  return templateBody.replace(/\{(\w+)\}/g, (_, key: string) => {
    const value = variables[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
};

export const getAirbnbTemplateById = (templateId?: string | null): AirbnbTemplate | null => {
  if (!templateId) return null;
  return AIRBNB_MESSAGE_TEMPLATES.find((template) => template.id === templateId) || null;
};
