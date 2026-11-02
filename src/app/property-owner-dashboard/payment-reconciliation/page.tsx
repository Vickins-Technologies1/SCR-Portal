import OwnerPageShell from "../components/OwnerPageShell";
import PaymentReconciliationDashboard from "@/components/PaymentReconciliationDashboard";

export default function PaymentReconciliationPage() {
  return (
    <OwnerPageShell>
      <PaymentReconciliationDashboard detailHrefBase="/property-owner-dashboard/payment-reconciliation" />
    </OwnerPageShell>
  );
}
