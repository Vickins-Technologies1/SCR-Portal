import OwnerPageShell from "../../components/OwnerPageShell";
import PaymentReconciliationDetails from "@/components/PaymentReconciliationDetails";

export default async function PaymentReconciliationDetailPage({ params }: { params: Promise<{ reconciliationId: string }> }) {
  const { reconciliationId } = await params;
  return <OwnerPageShell><PaymentReconciliationDetails reconciliationId={reconciliationId} backHref="/property-owner-dashboard/payment-reconciliation" /></OwnerPageShell>;
}
