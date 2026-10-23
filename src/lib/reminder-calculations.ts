export interface ReminderDueInput {
  rentAmount: number;
  rentPaid?: number;
  depositAmount?: number;
  depositPaid?: number;
  utilityAmount?: number;
  utilityPaid?: number;
  penaltiesAmount?: number;
}

export interface ReminderDueBreakdown {
  rentDue: number;
  utilityDue: number;
  depositDue: number;
  totalDue: number;
  penaltiesDue: number;
}

const normalizeAmount = (value?: number): number => (Number.isFinite(value) ? Number(value) : 0);

export const calculateReminderDueAmounts = (input: ReminderDueInput): ReminderDueBreakdown => {
  const rentAmount = Math.max(0, normalizeAmount(input.rentAmount));
  const rentPaid = Math.max(0, normalizeAmount(input.rentPaid));
  const depositAmount = Math.max(0, normalizeAmount(input.depositAmount));
  const depositPaid = Math.max(0, normalizeAmount(input.depositPaid));
  const utilityAmount = Math.max(0, normalizeAmount(input.utilityAmount));
  const utilityPaid = Math.max(0, normalizeAmount(input.utilityPaid));
  const penaltiesDue = Math.round(Math.max(0, normalizeAmount(input.penaltiesAmount)) * 100) / 100;

  const rentDue = Math.round(Math.max(0, rentAmount - rentPaid) * 100) / 100;
  const depositDue = Math.round(Math.max(0, depositAmount - depositPaid) * 100) / 100;
  const utilityDue = Math.round(Math.max(0, utilityAmount - utilityPaid) * 100) / 100;
  const totalDue = Math.round((rentDue + depositDue + utilityDue + penaltiesDue) * 100) / 100;

  return {
    rentDue,
    utilityDue,
    depositDue,
    totalDue,
    penaltiesDue,
  };
};
