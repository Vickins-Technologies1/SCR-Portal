export function summarizeTenantInvoices(invoices: Array<{ status: string; totalMinor: number; amountPaidMinor?: number; balanceMinor?: number }>) {
  const issued = invoices.filter((invoice) => invoice.status !== "draft" && invoice.status !== "cancelled");
  const totalInvoicedMinor = issued.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.totalMinor) || 0), 0);
  const totalCollectedMinor = issued.reduce((sum, invoice) => sum + Math.max(0, Math.min(Number(invoice.totalMinor) || 0, Number(invoice.amountPaidMinor) || 0)), 0);
  const outstandingMinor = issued.reduce((sum, invoice) => sum + Math.max(0, Number(invoice.balanceMinor ?? invoice.totalMinor) || 0), 0);
  return {
    totalInvoices: issued.length,
    draftInvoices: invoices.filter((invoice) => invoice.status === "draft").length,
    totalInvoicedMinor,
    totalCollectedMinor,
    outstandingMinor,
    paidInvoices: issued.filter((invoice) => Number(invoice.balanceMinor ?? invoice.totalMinor) <= 0).length,
    partiallyPaidInvoices: issued.filter((invoice) => Number(invoice.amountPaidMinor) > 0 && Number(invoice.balanceMinor ?? invoice.totalMinor) > 0).length,
    unpaidInvoices: issued.filter((invoice) => Number(invoice.amountPaidMinor) <= 0 && Number(invoice.balanceMinor ?? invoice.totalMinor) > 0).length,
    overdueInvoices: issued.filter((invoice) => invoice.status === "overdue").length,
    settlementRate: totalInvoicedMinor > 0 ? Math.round((totalCollectedMinor / totalInvoicedMinor) * 10_000) / 100 : 0,
  };
}
