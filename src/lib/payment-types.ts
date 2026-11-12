export const TENANT_PAYMENT_TYPES = [
  "AllDues",
  "RentAndUtility",
  "Rent",
  "Utility",
  "Deposit",
  "Other",
] as const;

export type TenantPaymentType = (typeof TENANT_PAYMENT_TYPES)[number];

export function paymentTypeLabel(type?: string | null) {
  if (type === "AllDues") return "All outstanding dues";
  if (type === "RentAndUtility") return "Rent + Utilities";
  if (type === "Utility") return "Utilities";
  return type || "Other";
}
