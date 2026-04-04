"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import Cookies from "js-cookie";
import { useRouter, useParams } from "next/navigation";
import { usePermissions } from "@/hooks/usePermissions";
import { ArrowLeft } from "lucide-react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import { ResponseTenant } from "@/types/tenant";
import Navbar from "../../components/Navbar";
import Sidebar from "../../components/Sidebar";
import Modal from "../../components/Modal";
import TenantInfoGrid from "../../components/TenantInfoGrid";
import DuesSection from "../../components/DuesSection";
import ActionButtons from "../../components/ActionButtons";
import RecordPaymentModal from "../../components/RecordPaymentModal";
import ImpersonateModal from "../../components/ImpersonateModal";

interface Property {
  _id: string;
  name: string;
}

interface PaymentFormData {
  amount: string;
  type: "Rent" | "Utility" | "Deposit" | "Other";
  reference: string;
  paymentDate: string;
}

interface PaymentStatement {
  _id: string;
  amount: number;
  paymentDate: string;
  status: string;
  type?: string;
  reference?: string;
  transactionId?: string;
  mpesaCode?: string;
  isManual?: boolean;
}

interface PaymentReport {
  generatedAt: string;
  paymentStatusLabel: string;
  overdueBalance: number;
  totalPaid: number;
  collectionRate: number;
  walletBalance: number;
  rentPerMonth: number;
  leaseRange: string;
  insights: string[];
  statements: PaymentStatement[];
  reportText: string;
}

export default function TenantDetailsPage() {
  const router = useRouter();
  const { tenantId } = useParams() as { tenantId: string };
  const perm = usePermissions();
  const canViewTenants = perm.hasPermission("tenants:view");
  const canManageTenants = perm.hasPermission("tenants:edit");
  const canRecordPayments = perm.hasPermission("payments:record");
  const canViewPayments = perm.hasPermission("payments:view");
  const canViewReports = perm.hasPermission("reports:view");
  const canExportReports = perm.hasPermission("reports:export");
  const canImpersonate = perm.hasPermission("security:manage");

  const [tenant, setTenant] = useState<ResponseTenant | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(Cookies.get("csrf-token") || null);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isDuesLoading, setIsDuesLoading] = useState(false);
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showImpersonateModal, setShowImpersonateModal] = useState(false);

  const [paymentData, setPaymentData] = useState<PaymentFormData>({
    amount: "",
    type: "Rent",
    reference: "",
    paymentDate: new Date().toISOString().split("T")[0],
  });
  const [paymentErrors, setPaymentErrors] = useState<Record<string, string>>({});
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportData, setReportData] = useState<PaymentReport | null>(null);
  const [reportCopied, setReportCopied] = useState(false);
  const [paymentStatements, setPaymentStatements] = useState<PaymentStatement[]>([]);
  const [isPaymentsLoading, setIsPaymentsLoading] = useState(false);

  const requestInProgress = useRef(false);
  const lastRequestTime = useRef(0);
  const rateLimitDelay = 800;

  const formatCurrency = (amount: number) => `Ksh ${amount.toLocaleString()}`;

  const getTenantUnitSummary = (currentTenant: ResponseTenant) => {
    const units = currentTenant.leasedUnits && currentTenant.leasedUnits.length > 0
      ? currentTenant.leasedUnits
      : [{
          unitIdentifier: currentTenant.unitIdentifier,
          unitType: currentTenant.unitType,
          houseNumber: currentTenant.houseNumber,
          price: currentTenant.price,
          deposit: currentTenant.deposit,
        }];

    const unitNumbers = units
      .map((unit) => unit.houseNumber)
      .filter(Boolean)
      .join(", ");

    const unitTypes = units
      .map((unit) => unit.unitType)
      .filter(Boolean)
      .join(", ");

    return {
      units,
      unitNumbers: unitNumbers || "—",
      unitTypes: unitTypes || "—",
    };
  };

  const getStatementReference = (statement: PaymentStatement) => {
    const isManual = statement.isManual ?? statement.transactionId?.startsWith("MANUAL-");
    if (isManual) {
      return statement.reference || statement.transactionId || "—";
    }
    return statement.mpesaCode || statement.transactionId || "—";
  };

  const getPaymentSnapshot = (currentTenant: ResponseTenant) => {
    const overdueBalance = Math.max(currentTenant.dues?.totalRemainingDues ?? 0, 0);
    const statusText = (currentTenant.paymentStatus || "").toLowerCase();
    const isOverdue = statusText === "overdue" || overdueBalance > 0;
    return {
      isOverdue,
      label: isOverdue ? "Overdue" : "Up to date",
      overdueBalance,
    };
  };

  const buildPaymentReport = (
    currentTenant: ResponseTenant,
    currentProperty: Property | null,
    statements: PaymentStatement[]
  ): PaymentReport => {
    const unitSummary = getTenantUnitSummary(currentTenant);
    const snapshot = getPaymentSnapshot(currentTenant);
    const totalPaid =
      (currentTenant.totalRentPaid || 0) +
      (currentTenant.totalUtilityPaid || 0) +
      (currentTenant.totalDepositPaid || 0);
    const totalOutstanding = snapshot.overdueBalance;
    const collectionRate =
      totalPaid + totalOutstanding > 0
        ? Math.round((totalPaid / (totalPaid + totalOutstanding)) * 100)
        : 100;
    const leaseStart = new Date(currentTenant.leaseStartDate);
    const leaseEnd = new Date(currentTenant.leaseEndDate);
    const daysToLeaseEnd = Math.ceil((leaseEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    const leaseRange = `${leaseStart.toLocaleDateString()} → ${leaseEnd.toLocaleDateString()}`;

    const insights: string[] = [];
    if (snapshot.isOverdue) {
      insights.push(`Overdue balance is ${formatCurrency(snapshot.overdueBalance)}. Consider a follow-up reminder.`);
    } else {
      insights.push("Tenant is fully up to date on payments.");
    }

    if (collectionRate < 80) {
      insights.push("Collection rate is below 80%. Review payment cadence and reconcile any gaps.");
    } else if (collectionRate >= 95) {
      insights.push("Collection rate is strong. Keep the current payment workflow.");
    }

    if (Number.isFinite(daysToLeaseEnd)) {
      if (daysToLeaseEnd < 0) {
        insights.push(`Lease ended ${Math.abs(daysToLeaseEnd)} day(s) ago. Plan the next steps.`);
      } else if (daysToLeaseEnd <= 30) {
        insights.push(`Lease ends in ${daysToLeaseEnd} day(s). Consider renewal outreach.`);
      }
    }

    const statementLines = statements.length
      ? statements.map((statement) => {
          const date = new Date(statement.paymentDate).toLocaleDateString();
          const ref = getStatementReference(statement);
          const type = statement.type || "Other";
          return `${date} | ${type} | Ksh ${statement.amount.toLocaleString()} | ${statement.status} | ${ref}`;
        })
      : ["No payments recorded."];

    const generatedAt = new Date().toLocaleString();
    const reportText = [
      "Tenant Payment Report",
      `Generated: ${generatedAt}`,
      "",
      `Tenant: ${currentTenant.name}`,
      `Property: ${currentProperty?.name || "—"}`,
      `Units: ${unitSummary.unitNumbers}`,
      `Lease: ${leaseRange}`,
      "",
      "Summary",
      `Payment status: ${snapshot.label}`,
      `Overdue balance: ${formatCurrency(snapshot.overdueBalance)}`,
      `Total paid: ${formatCurrency(totalPaid)}`,
      `Collection rate: ${collectionRate}%`,
      `Wallet balance: ${formatCurrency(currentTenant.walletBalance || 0)}`,
      "",
      "Insights",
      ...insights.map((insight) => `- ${insight}`),
      "",
      "Breakdown",
      `Rent paid: ${formatCurrency(currentTenant.totalRentPaid || 0)}`,
      `Utility paid: ${formatCurrency(currentTenant.totalUtilityPaid || 0)}`,
      `Deposit paid: ${formatCurrency(currentTenant.totalDepositPaid || 0)}`,
      "",
      "Payment Statements",
      ...statementLines,
    ].join("\n");

    return {
      generatedAt,
      paymentStatusLabel: snapshot.label,
      overdueBalance: snapshot.overdueBalance,
      totalPaid,
      collectionRate,
      walletBalance: currentTenant.walletBalance || 0,
      rentPerMonth: currentTenant.price || 0,
      leaseRange,
      insights,
      statements,
      reportText,
    };
  };

  const handleGenerateReport = () => {
    if (!tenant) return;
    if (!canViewReports) return;
    const report = buildPaymentReport(tenant, property, paymentStatements);
    setReportData(report);
    setReportCopied(false);
    setShowReportModal(true);
  };

  const generateReportPdf = async (
    report: PaymentReport,
    currentTenant: ResponseTenant,
    currentProperty: Property | null
  ) => {
    const unitSummary = getTenantUnitSummary(currentTenant);
    const sanitizePdfText = (input: string) =>
      input
        .replace(/→/g, "->")
        .replace(/•/g, "-")
        .replace(/—|–/g, "-")
        .replace(/[“”]/g, "\"")
        .replace(/[’]/g, "'")
        .replace(/[^\x20-\x7E]/g, "");

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const pageSize: [number, number] = [595.28, 841.89];
    const marginX = 48;
    const marginTop = 52;
    const lineHeight = 14;
    let page = pdfDoc.addPage(pageSize);
    let y = page.getHeight() - marginTop;

    const ensureSpace = (height: number) => {
      if (y - height < 60) {
        page = pdfDoc.addPage(pageSize);
        y = page.getHeight() - marginTop;
      }
    };

    const drawTextLine = (
      text: string,
      options: { size?: number; font?: any; color?: any; x?: number } = {}
    ) => {
      ensureSpace(lineHeight);
      const safeText = sanitizePdfText(text);
      page.drawText(safeText, {
        x: options.x ?? marginX,
        y,
        size: options.size ?? 11,
        font: options.font ?? font,
        color: options.color ?? rgb(0.15, 0.2, 0.3),
      });
      y -= lineHeight;
    };

    const drawSectionTitle = (title: string) => {
      ensureSpace(18);
      page.drawText(title, {
        x: marginX,
        y,
        size: 12,
        font: bold,
        color: rgb(0.05, 0.2, 0.25),
      });
      y -= 18;
    };

    drawTextLine("Tenant Payment Report", { font: bold, size: 18, color: rgb(0.02, 0.2, 0.25) });
    drawTextLine(`Generated: ${report.generatedAt}`, { size: 10, color: rgb(0.45, 0.45, 0.45) });
    y -= 4;

    drawSectionTitle("Summary");
    [
      ["Tenant", currentTenant.name],
      ["Property", currentProperty?.name || "—"],
      ["Units", unitSummary.unitNumbers],
      ["Lease", report.leaseRange],
      ["Payment status", report.paymentStatusLabel],
      ["Overdue balance", formatCurrency(report.overdueBalance)],
      ["Total paid", formatCurrency(report.totalPaid)],
      ["Collection rate", `${report.collectionRate}%`],
      ["Wallet balance", formatCurrency(report.walletBalance)],
    ].forEach(([label, value]) => {
      drawTextLine(`${label}: ${value}`);
    });
    y -= 6;

    drawSectionTitle("Insights");
    report.insights.forEach((insight) => {
      drawTextLine(`• ${insight}`, { size: 10, color: rgb(0.25, 0.3, 0.4) });
    });
    y -= 6;

    drawSectionTitle("Payment Statements");
    if (!report.statements.length) {
      drawTextLine("No payments recorded.", { size: 10, color: rgb(0.35, 0.35, 0.35) });
    } else {
      const colX = {
        date: marginX,
        type: marginX + 90,
        amount: marginX + 190,
        status: marginX + 290,
        ref: marginX + 380,
      };

      const drawTableHeader = () => {
        ensureSpace(16);
        page.drawText("Date", { x: colX.date, y, size: 9, font: bold, color: rgb(0.1, 0.2, 0.3) });
        page.drawText("Type", { x: colX.type, y, size: 9, font: bold, color: rgb(0.1, 0.2, 0.3) });
        page.drawText("Amount", { x: colX.amount, y, size: 9, font: bold, color: rgb(0.1, 0.2, 0.3) });
        page.drawText("Status", { x: colX.status, y, size: 9, font: bold, color: rgb(0.1, 0.2, 0.3) });
        page.drawText("Reference", { x: colX.ref, y, size: 9, font: bold, color: rgb(0.1, 0.2, 0.3) });
        y -= 14;
        page.drawLine({
          start: { x: marginX, y: y + 4 },
          end: { x: page.getWidth() - marginX, y: y + 4 },
          thickness: 0.5,
          color: rgb(0.8, 0.82, 0.85),
        });
      };

      drawTableHeader();

      report.statements.forEach((statement) => {
        ensureSpace(14);
        if (y < 70) {
          page = pdfDoc.addPage(pageSize);
          y = page.getHeight() - marginTop;
          drawTableHeader();
        }

        const date = new Date(statement.paymentDate).toLocaleDateString();
        const type = statement.type || "Other";
        const amount = formatCurrency(statement.amount);
        const {status} = statement;
        const ref = getStatementReference(statement).toString();
        const trimmedRef = ref.length > 18 ? `${ref.slice(0, 15)}...` : ref;

        page.drawText(sanitizePdfText(date), { x: colX.date, y, size: 9, font });
        page.drawText(sanitizePdfText(type), { x: colX.type, y, size: 9, font });
        page.drawText(sanitizePdfText(amount), { x: colX.amount, y, size: 9, font });
        page.drawText(sanitizePdfText(status), { x: colX.status, y, size: 9, font });
        page.drawText(sanitizePdfText(trimmedRef), { x: colX.ref, y, size: 9, font });

        y -= 14;
      });
    }

    return pdfDoc.save();
  };

  const handleDownloadReport = async () => {
    if (!tenant || !reportData) return;
    if (!canExportReports) {
      alert("You do not have permission to export reports.");
      return;
    }

    const safeName = tenant.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const dateStamp = new Date().toISOString().split("T")[0];

    try {
      const pdfBytes = await generateReportPdf(reportData, tenant, property);

      // Fix for TS error: pdf-lib returns Uint8Array, Blob accepts it at runtime
      // Type assertion resolves the strict ArrayBuffer vs ArrayBufferLike mismatch
      const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `tenant-payment-report-${safeName || "tenant"}-${dateStamp}.pdf`;

      document.body.appendChild(link);
      link.click();

      // Clean up
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Failed to generate or download PDF:", err);
      alert("Could not generate the PDF report. Please try again.");
    }
  };

  const handleCopyReport = async () => {
    if (!reportData) return;
    try {
      await navigator.clipboard.writeText(reportData.reportText);
      setReportCopied(true);
      setTimeout(() => setReportCopied(false), 2000);
    } catch {
      setReportCopied(false);
    }
  };

  const fetchCsrfToken = useCallback(async (): Promise<string | null> => {
    if (requestInProgress.current) return csrfToken;
    requestInProgress.current = true;
    const now = Date.now();
    if (now - lastRequestTime.current < rateLimitDelay) {
      await new Promise((r) => setTimeout(r, rateLimitDelay - (now - lastRequestTime.current)));
    }
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      const data = await res.json();
      if (data.success && data.csrfToken) {
        const token = data.csrfToken;
        setCsrfToken(token);
        Cookies.set("csrf-token", token, { path: "/", secure: true, sameSite: "strict" });
        return token;
      }
    } catch (err) {
      console.error("CSRF error:", err);
    } finally {
      requestInProgress.current = false;
      lastRequestTime.current = Date.now();
    }
    return null;
  }, [csrfToken]);

  const fetchTenantData = useCallback(async (token: string) => {
    if (!userId || !tenantId || !token) return;
    setIsPageLoading(true);
    try {
      const res = await fetch(`/api/tenants/${tenantId}`, {
        headers: { "X-CSRF-Token": token },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      if (data.success) {
        setTenant(data.tenant);
        setProperty(data.property || null);
      }
    } catch {
      setTenant(null);
    } finally {
      setIsPageLoading(false);
    }
  }, [userId, tenantId]);

  const fetchPaymentStatements = useCallback(async () => {
    if (!tenantId) return;
    if (!canViewPayments) return;
    setIsPaymentsLoading(true);
    try {
      const res = await fetch(
        `/api/payments?tenantId=${tenantId}&limit=50&sort=-paymentDate`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (data.success) {
        setPaymentStatements(data.payments || []);
      } else {
        setPaymentStatements([]);
      }
    } catch {
      setPaymentStatements([]);
    } finally {
      setIsPaymentsLoading(false);
    }
  }, [tenantId, canViewPayments]);

  const fetchDues = useCallback(async (token: string) => {
    if (!userId || !tenantId || !token) return;
    setIsDuesLoading(true);
    try {
      const res = await fetch("/api/tenants/check-dues", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": token },
        credentials: "include",
        body: JSON.stringify({ tenantId, userId }),
      });
      const data = await res.json();
      if (data.success) {
        setTenant((prev) =>
          prev
            ? {
                ...prev,
                dues: data.dues,
                totalRentPaid: data.tenant.totalRentPaid,
                totalDepositPaid: data.tenant.totalDepositPaid,
                totalUtilityPaid: data.tenant.totalUtilityPaid,
                walletBalance: data.tenant.walletBalance ?? prev.walletBalance,
                paymentStatus: data.tenant.paymentStatus,
                monthsStayed: data.monthsStayed,
              }
            : null
        );
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsDuesLoading(false);
    }
  }, [userId, tenantId]);

  // Authentication check
  useEffect(() => {
    const uid = Cookies.get("userId");
    const role = Cookies.get("role");
    const ownerIdFromCookie = Cookies.get("ownerId");

    if (!uid || !["propertyOwner", "teamMember"].includes(role || "")) {
      router.replace("/login");
      return;
    }

    if (role === "teamMember" && !canViewTenants) {
      router.replace("/property-owner-dashboard");
      return;
    }

    const ownerIdToUse = role === "propertyOwner" ? uid : (ownerIdFromCookie || uid);
    if (!ownerIdToUse) {
      router.replace("/login");
      return;
    }

    setUserId(ownerIdToUse);
  }, [router, canViewTenants]);

  // Load tenant data and dues
  useEffect(() => {
    if (userId) {
      const load = async () => {
        const token = csrfToken || (await fetchCsrfToken());
        if (token) {
          await fetchTenantData(token);
          await fetchDues(token);
          await fetchPaymentStatements();
        }
      };
      load();
    }
  }, [userId, csrfToken, fetchCsrfToken, fetchTenantData, fetchDues, fetchPaymentStatements]);

  // Auto-fill payment amount based on selected type
  useEffect(() => {
    if (showPaymentModal && tenant?.dues) {
      const { rentDues, depositDues, utilityDues, totalRemainingDues } = tenant.dues;
      let amount = "";
      if (paymentData.type === "Rent" && rentDues > 0) amount = rentDues.toFixed(2);
      else if (paymentData.type === "Deposit" && depositDues > 0) amount = depositDues.toFixed(2);
      else if (paymentData.type === "Utility" && utilityDues > 0) amount = utilityDues.toFixed(2);
      else if (totalRemainingDues > 0) amount = totalRemainingDues.toFixed(2);
      setPaymentData((prev) => ({ ...prev, amount }));
    }
  }, [showPaymentModal, tenant?.dues, paymentData.type]);

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenant || !csrfToken) return;
    if (!canRecordPayments) {
      setPaymentErrors({ general: "You do not have permission to record payments." });
      return;
    }

    const errors: Record<string, string> = {};
    if (!paymentData.amount || parseFloat(paymentData.amount) <= 0) errors.amount = "Invalid amount";
    if (!paymentData.reference.trim()) errors.reference = "Reference required";

    if (Object.keys(errors).length) {
      setPaymentErrors(errors);
      return;
    }

    setIsRecordingPayment(true);
    try {
      const res = await fetch("/api/tenant/payments/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        credentials: "include",
        body: JSON.stringify({
          tenantId: tenant._id,
          userId,
          propertyId: tenant.propertyId,
          amount: parseFloat(paymentData.amount),
          type: paymentData.type,
          reference: paymentData.reference.trim(),
          paymentDate: paymentData.paymentDate,
        }),
      });
      const result = await res.json();

      if (result.success) {
        setSuccessMessage(`Ksh ${paymentData.amount} recorded!`);
        setShowPaymentModal(false);
        setPaymentData({ ...paymentData, amount: "", reference: "" });
        const token = csrfToken || (await fetchCsrfToken());
        if (token) {
          await fetchTenantData(token);
          await fetchDues(token);
          await fetchPaymentStatements();
        }
      } else {
        setPaymentErrors({ general: result.message || "Failed" });
      }
    } catch {
      setPaymentErrors({ general: "Network error" });
    } finally {
      setIsRecordingPayment(false);
    }
  };

  // Impersonation handler
  const handleImpersonate = async () => {
    if (!tenant || !userId || !csrfToken) return;
    if (!canImpersonate) {
      alert("You do not have permission to impersonate tenants.");
      return;
    }

    setIsImpersonating(true);

    try {
      const res = await fetch("/api/impersonate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          tenantId: tenant._id,
          ownerId: userId,
        }),
      });

      const result = await res.json();

      if (result.success) {
        router.push("/tenant-dashboard");
      } else {
        alert(result.message || "Failed to impersonate tenant.");
      }
    } catch (err) {
      console.error("Impersonation error:", err);
      alert("Network error. Please try again.");
    } finally {
      setIsImpersonating(false);
      setShowImpersonateModal(false);
    }
  };

  if (isPageLoading || !tenant) {
    return (
      <div className="min-h-[100svh] bg-background text-foreground flex items-center justify-center p-4">
        <div className="glass-panel rounded-2xl px-6 py-5 text-center">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xs sm:text-sm text-muted-foreground">Loading tenant...</p>
        </div>
      </div>
    );
  }

  const paymentSnapshot = getPaymentSnapshot(tenant);
  const unitSummary = getTenantUnitSummary(tenant);

  return (
    <>
      {/* Recording Payment Overlay */}
      {isRecordingPayment && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="text-center">
            <h3 className="text-2xl font-bold text-white mb-6">Recording Payment...</h3>
            <div className="grid grid-cols-3 gap-3">
              {[...Array(9)].map((_, i) => (
                <div
                  key={i}
                  className="w-16 h-16 bg-primary rounded-xl animate-pulse"
                  style={{ animationDelay: `${i * 0.1}s` }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="min-h-[100svh] bg-background text-foreground">
        <Navbar />
        <Sidebar />

        <div className="md:ml-72 pt-16 pb-16 px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
          {/* Back Button */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => router.push("/property-owner-dashboard/tenants")}
              className="flex items-center gap-2 rounded-full border border-border bg-white/70 px-4 py-2 text-xs sm:text-sm font-semibold text-foreground shadow-sm hover:border-primary/40 hover:text-primary transition"
            >
              <ArrowLeft className="w-5 h-5" />
              Back
            </button>
          </div>

          {/* Tenant Header */}
          <section className="glass-panel rounded-3xl p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary text-xl font-bold shadow-sm flex-shrink-0">
                  {tenant.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-muted-foreground">Tenant Profile</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">{tenant.name}</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    {property?.name ? `${property.name} • ${unitSummary.unitNumbers}` : "Property"}
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Lease {new Date(tenant.leaseStartDate).toLocaleDateString()} →{" "}
                    {new Date(tenant.leaseEndDate).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold ${
                    paymentSnapshot.isOverdue
                      ? "bg-red-100 text-red-700"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {paymentSnapshot.label}
                </span>
                <span
                  className={`px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold ${
                    paymentSnapshot.isOverdue
                      ? "bg-red-50 text-red-600"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  Overdue: {formatCurrency(paymentSnapshot.overdueBalance)}
                </span>
                <span className="px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-muted text-foreground/70">
                  Wallet: {formatCurrency(tenant.walletBalance || 0)}
                </span>
              </div>
            </div>
          </section>

          {/* Success Message */}
          {successMessage && (
            <div className="glass-panel rounded-2xl px-4 py-3 text-xs sm:text-sm font-semibold text-primary flex justify-between items-center">
              <span>{successMessage}</span>
              <button onClick={() => setSuccessMessage(null)} className="text-xl">
                ×
              </button>
            </div>
          )}

          {/* Main Content */}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
            <section className="surface-card rounded-3xl p-5 sm:p-6 space-y-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">Overview</p>
                <h2 className="text-lg sm:text-xl font-semibold text-foreground">Tenant Overview</h2>
              </div>
              <TenantInfoGrid tenant={tenant} property={property} />
              <div className="glass-panel rounded-2xl p-4 sm:p-5">
                <DuesSection tenant={tenant} isDuesLoading={isDuesLoading} />
              </div>
            </section>

            <section className="glass-panel rounded-3xl p-5 sm:p-6">
              <div>
                <p className="text-[11px] uppercase tracking-[0.35em] text-muted-foreground">Actions</p>
                <h3 className="text-lg sm:text-xl font-semibold text-foreground">Manage Tenant</h3>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Record payments, export reports, or impersonate securely.
                </p>
              </div>
              <div className="mt-5">
                <ActionButtons
                  onRecordPayment={() => {
                    if (!canRecordPayments) return;
                    setShowPaymentModal(true);
                  }}
                  onEdit={() => alert("Coming soon")}
                  onImpersonate={() => {
                    if (!canImpersonate) return;
                    setShowImpersonateModal(true);
                  }}
                  onDelete={() => {
                    if (!canManageTenants) return;
                    alert("Coming soon");
                  }}
                  onGenerateReport={handleGenerateReport}
                  canRecordPayment={canRecordPayments}
                  canGenerateReport={canViewReports}
                  canImpersonate={canImpersonate}
                  canDelete={canManageTenants}
                />
              </div>
            </section>
          </div>
          </div>
        </div>

        {/* Modals */}
        <RecordPaymentModal
          isOpen={showPaymentModal}
          onClose={() => {
            setShowPaymentModal(false);
            setPaymentErrors({});
            setPaymentData({ ...paymentData, amount: "", reference: "" });
          }}
          tenant={tenant}
          paymentData={paymentData}
          setPaymentData={setPaymentData}
          paymentErrors={paymentErrors}
          setPaymentErrors={setPaymentErrors}
          onSubmit={handlePaymentSubmit}
          isLoading={isRecordingPayment}
        />

        <ImpersonateModal
          isOpen={showImpersonateModal}
          onClose={() => setShowImpersonateModal(false)}
          tenantName={tenant.name}
          onConfirm={handleImpersonate}
          isLoading={isImpersonating}
        />

        <Modal
          title="Tenant Payment Report"
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          className="max-w-3xl"
        >
          {reportData ? (
            <div className="space-y-6">
              <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-900 to-primary-hover text-white p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-200">Payment Health Snapshot</p>
                    <h3 className="text-2xl font-semibold mt-2">{tenant.name}</h3>
                    <p className="text-sm text-slate-200 mt-1">
                      {property?.name || "Property"} • {unitSummary.unitNumbers}
                    </p>
                  </div>
                  <span
                    className={`px-4 py-2 rounded-full text-sm font-semibold ${
                      reportData.paymentStatusLabel === "Overdue"
                        ? "bg-red-500/30 text-red-100"
                        : "bg-primary/30 text-white/90"
                    }`}
                  >
                    {reportData.paymentStatusLabel}
                  </span>
                </div>

                <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-xs uppercase text-slate-200">Overdue</p>
                    <p className="text-xl font-bold mt-2">{formatCurrency(reportData.overdueBalance)}</p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-xs uppercase text-slate-200">Collection Rate</p>
                    <p className="text-xl font-bold mt-2">{reportData.collectionRate}%</p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4">
                    <p className="text-xs uppercase text-slate-200">Total Paid</p>
                    <p className="text-xl font-bold mt-2">{formatCurrency(reportData.totalPaid)}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Breakdown</h4>
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <div className="flex justify-between">
                      <span>Rent paid</span>
                      <span className="font-semibold">{formatCurrency(tenant.totalRentPaid || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Utility paid</span>
                      <span className="font-semibold">{formatCurrency(tenant.totalUtilityPaid || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Deposit paid</span>
                      <span className="font-semibold">{formatCurrency(tenant.totalDepositPaid || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Wallet balance</span>
                      <span className="font-semibold">{formatCurrency(tenant.walletBalance || 0)}</span>
                    </div>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl p-5">
                  <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Lease & Rent</h4>
                  <div className="mt-4 space-y-3 text-sm text-slate-700">
                    <div className="flex justify-between">
                      <span>Lease window</span>
                      <span className="font-semibold">{reportData.leaseRange}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Monthly rent</span>
                      <span className="font-semibold">{formatCurrency(reportData.rentPerMonth)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Generated</span>
                      <span className="font-semibold">{reportData.generatedAt}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl p-5">
                <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Insights</h4>
                <ul className="mt-4 space-y-2 text-sm text-slate-700 list-disc list-inside">
                  {reportData.insights.map((insight) => (
                    <li key={insight}>{insight}</li>
                  ))}
                </ul>
              </div>

              <div className="border border-slate-200 rounded-xl p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Payment Statements</h4>
                  {isPaymentsLoading && (
                    <span className="text-xs text-slate-500">Refreshing...</span>
                  )}
                </div>
                <div className="mt-4 table-shell">
                  <div className="table-scroll">
                  <table className="min-w-full">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Reference</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-700">
                      {reportData.statements.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-4 px-2 text-slate-500 text-xs sm:text-sm">
                            No payment statements available yet.
                          </td>
                        </tr>
                      ) : (
                        reportData.statements.map((statement) => (
                          <tr key={statement._id} className="hover:bg-primary/5">
                            <td className="py-2 px-2 whitespace-nowrap">
                              {new Date(statement.paymentDate).toLocaleDateString()}
                            </td>
                            <td className="py-2 px-2">{statement.type || "Other"}</td>
                            <td className="py-2 px-2 font-semibold">
                              {formatCurrency(statement.amount)}
                            </td>
                            <td className="py-2 px-2 capitalize">{statement.status}</td>
                            <td className="py-2 px-2">
                              {getStatementReference(statement)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">Share this report with owners, accountants, or your team.</p>
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={handleCopyReport}
                    className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition"
                  >
                    {reportCopied ? "Copied" : "Copy Summary"}
                  </button>
                  {canExportReports && (
                    <button
                      onClick={handleDownloadReport}
                      className="px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-semibold hover:bg-slate-950 transition"
                    >
                      Download PDF
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Generating report...</p>
          )}
        </Modal>
      </div>
    </>
  );
}



























