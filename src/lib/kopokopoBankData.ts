export type KopoKopoBank = {
  name: string;
  accountLengths: number[];
};

export type KopoKopoBankBranchOption = {
  label: string;
  ref: string;
};

export const KOPOKOPO_BANKS: KopoKopoBank[] = [
  { name: "Absa", accountLengths: [10] },
  { name: "Co-operative Bank", accountLengths: [14] },
  { name: "Family Bank", accountLengths: [12] },
  { name: "I&M Bank", accountLengths: [14] },
  { name: "KCB", accountLengths: [10] },
  { name: "Middle East Bank (MEB)", accountLengths: [13] },
  { name: "National Bank of Kenya", accountLengths: [14] },
  { name: "NCBA", accountLengths: [10, 12] },
  { name: "Prime Bank", accountLengths: [10] },
  { name: "SBM Bank", accountLengths: [13] },
  { name: "Sidian Bank", accountLengths: [14] },
  { name: "Stanbic", accountLengths: [13] },
  { name: "Standard Chartered", accountLengths: [13] },
];

export const KOPOKOPO_BANK_BRANCHES: Record<string, KopoKopoBankBranchOption[]> =
  KOPOKOPO_BANKS.reduce<Record<string, KopoKopoBankBranchOption[]>>((acc, bank) => {
    acc[bank.name] = [];
    return acc;
  }, {});

export const getBankAccountRule = (bankName: string): KopoKopoBank | undefined =>
  KOPOKOPO_BANKS.find((bank) => bank.name === bankName);

export const validateBankAccountNumber = (bankName: string, accountNumber: string): string | null => {
  const normalized = accountNumber.replace(/\s+/g, "");
  if (!normalized) return "Please enter your bank account number.";
  if (!/^\d+$/.test(normalized)) return "Bank account number must contain digits only.";

  const rule = getBankAccountRule(bankName);
  if (!rule) return null;

  if (!rule.accountLengths.includes(normalized.length)) {
    const allowed = rule.accountLengths.join(" or ");
    return `${rule.name} account numbers must be ${allowed} digits long.`;
  }

  return null;
};
