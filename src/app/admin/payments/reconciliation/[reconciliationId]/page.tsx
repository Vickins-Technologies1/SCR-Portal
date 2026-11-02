import AdminPageShell from "../../../components/AdminPageShell";
import PaymentReconciliationDetails from "@/components/PaymentReconciliationDetails";

export default async function AdminPaymentReconciliationDetailPage({ params }: { params: Promise<{ reconciliationId: string }> }) {
  const { reconciliationId } = await params;
  return <AdminPageShell><PaymentReconciliationDetails reconciliationId={reconciliationId} backHref="/admin/payments/reconciliation" /></AdminPageShell>;
}
