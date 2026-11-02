import AdminPageShell from "../../components/AdminPageShell";
import PaymentReconciliationDashboard from "@/components/PaymentReconciliationDashboard";

export default function AdminPaymentReconciliationPage() {
  return (
    <AdminPageShell>
      <PaymentReconciliationDashboard detailHrefBase="/admin/payments/reconciliation" />
    </AdminPageShell>
  );
}
