export interface ReminderDueInput {
  rentAmount: number;
  rentPaid?: number;
  depositAmount?: number;
  depositPaid?: number;
  utilityAmount?: number;
  utilityPaid?: number;
}

export interface ReminderDueBreakdown {
  rentDue: number;
  utilityDue: number;
  depositDue: number;
  totalDue: number;
}

const normalizeAmount = (value?: number): number => (Number.isFinite(value) ? Number(value) : 0);

export const calculateReminderDueAmounts = (input: ReminderDueInput): ReminderDueBreakdown => {
  const rentAmount = Math.max(0, normalizeAmount(input.rentAmount));
  const rentPaid = Math.max(0, normalizeAmount(input.rentPaid));
  const depositAmount = Math.max(0, normalizeAmount(input.depositAmount));
  const depositPaid = Math.max(0, normalizeAmount(input.depositPaid));
  const utilityAmount = Math.max(0, normalizeAmount(input.utilityAmount));
  const utilityPaid = Math.max(0, normalizeAmount(input.utilityPaid));

  const rentDue = Math.max(0, rentAmount - rentPaid);
  const depositDue = Math.max(0, depositAmount - depositPaid);
  const utilityDue = Math.max(0, utilityAmount - utilityPaid);
  const totalDue = rentDue + depositDue + utilityDue;

  return {
    rentDue,
    utilityDue,
    depositDue,
    totalDue,
  };
};
