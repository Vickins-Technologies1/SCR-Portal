export type InvoicePaymentStatus = "PAID" | "PARTIALLY PAID" | "DUE" | "OVERDUE";

export type InvoiceCalculation = {
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  amountPaid: number;
  balanceDue: number;
  status: InvoicePaymentStatus;
};

export type InvoiceCalculationInput = {
  amount: number;
  items?: Array<{ qty?: number; rate?: number }> | null;
  discount?: number | null;
  tax?: number | null;
  amountPaid?: number | null;
  dueDate?: Date | string | null;
  now?: Date;
};

export function roundCurrency(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function validDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function calculateInvoiceTotals(input: InvoiceCalculationInput): InvoiceCalculation {
  const hasItems = Array.isArray(input.items) && input.items.length > 0;
  const subtotal = roundCurrency(
    hasItems
      ? input.items!.reduce((sum, item) => sum + Math.max(0, Number(item.qty) || 0) * Math.max(0, Number(item.rate) || 0), 0)
      : Math.max(0, Number(input.amount) || 0)
  );
  const discount = roundCurrency(Math.max(0, Number(input.discount) || 0));
  const tax = roundCurrency(Math.max(0, Number(input.tax) || 0));
  const total = roundCurrency(Math.max(0, subtotal - discount + tax));
  const amountPaid = roundCurrency(Math.max(0, Number(input.amountPaid) || 0));
  const balanceDue = roundCurrency(Math.max(0, total - amountPaid));
  const dueDate = validDate(input.dueDate);
  const now = input.now ?? new Date();

  let status: InvoicePaymentStatus;
  if (amountPaid >= total) status = "PAID";
  else if (amountPaid > 0) status = "PARTIALLY PAID";
  else if (dueDate && now.getTime() > dueDate.getTime()) status = "OVERDUE";
  else status = "DUE";

  return { subtotal, discount, tax, total, amountPaid, balanceDue, status };
}
