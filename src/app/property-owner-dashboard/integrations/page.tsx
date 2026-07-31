"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { ArrowRight, CheckCircle2, Clock, CreditCard, Landmark, PlugZap, Wallet } from "lucide-react";
import toast, { Toaster } from "react-hot-toast";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import Modal from "../components/Modal";
import { usePermissions } from "@/hooks/usePermissions";
import { useAccountTier } from "@/hooks/useAccountTier";
import PremiumGate from "@/components/PremiumGate";

type IntegrationStatus = "connected" | "available" | "coming_soon";

type IntegrationCard = {
  id: string;
  name: string;
  description: string;
  status: IntegrationStatus;
  badgeLabel?: string;
  cta?: string;
  icon: typeof PlugZap;
  logoSrc?: string;
  logoAlt?: string;
  logoClassName?: string;
};

type TumaState = {
  enabled: boolean;
  email: string;
  hasApiKey: boolean;
  maskedApiKey: string;
  businessId: string;
};

type TumaBusinessForm = {
  name: string;
  email: string;
  mobile: string;
  bankId: string;
  accountNumber: string;
  logo: string;
  description: string;
};

type TumaBank = {
  id: string;
  name: string;
  code?: string;
  country?: string;
};

type DarajaMode = "shared_daraja" | "user_paybill";

type DarajaPaymentType = "till" | "paybill";

type DarajaSharedState = {
  enabled: boolean;
  paymentType: DarajaPaymentType;
  destinationNumber: string;
  accountReference: string;
};

type DarajaUserPaybillState = {
  enabled: boolean;
  environment: "sandbox" | "production";
  shortcode: string;
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
};

type DarajaSharedView = DarajaSharedState & {
  maskedDestinationNumber: string;
  hasDestinationNumber: boolean;
};

type DarajaUserPaybillView = DarajaUserPaybillState & {
  maskedShortcode: string;
  maskedConsumerKey: string;
  hasCredentials: boolean;
};

const comingSoonIntegrations: IntegrationCard[] = [
  {
    id: "stripe",
    name: "Stripe",
    description: "Accept international card payments from tenants.",
    status: "coming_soon",
    cta: "Join waitlist",
    icon: CreditCard,
    logoSrc: "/brand/stripe.svg",
    logoAlt: "Stripe",
    logoClassName: "h-5",
  },
  {
    id: "paypal",
    name: "PayPal",
    description: "Offer PayPal for resident checkout and invoices.",
    status: "coming_soon",
    cta: "Notify me",
    icon: Wallet,
    logoSrc: "/brand/paypal.svg",
    logoAlt: "PayPal",
    logoClassName: "h-6",
  },
  {
    id: "banking",
    name: "Banking Partners",
    description: "Connect local bank partners for payouts and settlements.",
    status: "coming_soon",
    cta: "Request access",
    icon: Landmark,
  },
];

export default function OwnerIntegrationsPage() {
  const router = useRouter();
  const perm = usePermissions();
  const { isFree } = useAccountTier();
  const sessionRole = Cookies.get("role") || null;
  const isOwnerRole = sessionRole === "propertyOwner";
  const canViewIntegrations =
    perm.hasPermission("integrations:view") || perm.hasPermission("settings:view");
  const canEditIntegrations =
    isOwnerRole || perm.hasPermission("integrations:edit") || perm.hasPermission("settings:edit");

  const isReadOnly = !canEditIntegrations;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [tuma, setTuma] = useState<TumaState>({
    enabled: true,
    email: "",
    hasApiKey: false,
    maskedApiKey: "",
    businessId: "",
  });
  const [tumaApiKeyInput, setTumaApiKeyInput] = useState("");
  const [initial, setInitial] = useState({
    enabled: true,
    email: "",
    hasApiKey: false,
    businessId: "",
  });
  const [banks, setBanks] = useState<TumaBank[]>([]);
  const [banksLoading, setBanksLoading] = useState(false);
  const [darajaShared, setDarajaShared] = useState<DarajaSharedView>({
    enabled: true,
    paymentType: "paybill",
    destinationNumber: "",
    maskedDestinationNumber: "",
    accountReference: "",
    hasDestinationNumber: false,
  });
  const [darajaSharedInitial, setDarajaSharedInitial] = useState<DarajaSharedState>({
    enabled: true,
    paymentType: "paybill",
    destinationNumber: "",
    accountReference: "",
  });
  const [darajaUserPaybill, setDarajaUserPaybill] = useState<DarajaUserPaybillView>({
    enabled: true,
    environment: "sandbox",
    shortcode: "",
    consumerKey: "",
    consumerSecret: "",
    passkey: "",
    maskedShortcode: "",
    maskedConsumerKey: "",
    hasCredentials: false,
  });
  const [darajaUserPaybillInitial, setDarajaUserPaybillInitial] = useState<DarajaUserPaybillState>({
    enabled: true,
    environment: "sandbox",
    shortcode: "",
    consumerKey: "",
    consumerSecret: "",
    passkey: "",
  });
  const [tumaForm, setTumaForm] = useState<TumaBusinessForm>({
    name: "",
    email: "",
    mobile: "",
    bankId: "",
    accountNumber: "",
    logo: "",
    description: "",
  });
  const [tumaFormErrors, setTumaFormErrors] = useState<Partial<Record<keyof TumaBusinessForm, string>>>(
    {}
  );
  const [showModal, setShowModal] = useState(false);
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationCard | null>(null);
  const [tumaErrors, setTumaErrors] = useState<{ email?: string; apiKey?: string }>({});
  const [darajaSharedErrors, setDarajaSharedErrors] = useState<Partial<Record<keyof DarajaSharedState, string>>>(
    {}
  );
  const [darajaUserPaybillErrors, setDarajaUserPaybillErrors] = useState<
    Partial<Record<keyof DarajaUserPaybillState, string>>
  >({});
  const [darajaSavingMode, setDarajaSavingMode] = useState<DarajaMode | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [showDarajaSecrets, setShowDarajaSecrets] = useState(false);

  useEffect(() => {
    const id = Cookies.get("userId");
    const role = Cookies.get("role");
    const ownerIdFromCookie = Cookies.get("ownerId");

    if (!id || !["propertyOwner", "teamMember"].includes(role || "")) {
      toast.error("Unauthorized access. Please log in as a property owner or team member.");
      router.replace("/");
      return;
    }

    if (role === "teamMember" && !canViewIntegrations) {
      toast.error("Access restricted. You do not have permission to view integrations.");
      router.replace("/property-owner-dashboard");
      return;
    }

    const ownerIdToUse = role === "propertyOwner" ? id : (ownerIdFromCookie || id);
    if (!ownerIdToUse) {
      toast.error("Could not determine property owner. Please log in again.");
      router.replace("/");
      return;
    }

    const fetchIntegrations = async () => {
      setLoading(true);
      try {
        const [tumaRes, darajaRes] = await Promise.all([
          fetch("/api/owner/integrations", { credentials: "include" }),
          fetch("/api/owner/daraja", { credentials: "include" }),
        ]);
        const [tumaData, darajaData] = await Promise.all([tumaRes.json(), darajaRes.json()]);
        if (tumaRes.ok && tumaData.success) {
          const nextTuma = tumaData.integrations?.tuma || {};
          setTuma({
            enabled: nextTuma.enabled !== false,
            email: nextTuma.email || "",
            hasApiKey: !!nextTuma.hasApiKey,
            maskedApiKey: nextTuma.maskedApiKey || "",
            businessId: nextTuma.businessId || "",
          });
          setInitial({
            enabled: nextTuma.enabled !== false,
            email: nextTuma.email || "",
            hasApiKey: !!nextTuma.hasApiKey,
            businessId: nextTuma.businessId || "",
          });
          setTumaForm((prev) => ({
            ...prev,
            email: nextTuma.email || prev.email,
          }));
        } else {
          toast.error(tumaData.message || "Failed to load integrations.");
        }

        if (darajaRes.ok && darajaData.success) {
          const nextDaraja = darajaData.integrations?.daraja || {};
          const nextShared = nextDaraja.shared || {};
          const nextUserPaybill = nextDaraja.userPaybill || {};

          setDarajaShared({
            enabled: nextShared.enabled !== false,
            paymentType: nextShared.paymentType === "till" ? "till" : "paybill",
            destinationNumber: nextShared.destinationNumber || "",
            maskedDestinationNumber: nextShared.maskedDestinationNumber || "",
            accountReference: nextShared.accountReference || "",
            hasDestinationNumber: !!nextShared.hasDestinationNumber,
          });
          setDarajaSharedInitial({
            enabled: nextShared.enabled !== false,
            paymentType: nextShared.paymentType === "till" ? "till" : "paybill",
            destinationNumber: nextShared.destinationNumber || "",
            accountReference: nextShared.accountReference || "",
          });

          setDarajaUserPaybill({
            enabled: nextUserPaybill.enabled !== false,
            environment: nextUserPaybill.environment === "production" ? "production" : "sandbox",
            shortcode: nextUserPaybill.shortcode || "",
            consumerKey: "",
            consumerSecret: "",
            passkey: "",
            maskedShortcode: nextUserPaybill.maskedShortcode || "",
            maskedConsumerKey: nextUserPaybill.maskedConsumerKey || "",
            hasCredentials: !!nextUserPaybill.hasCredentials,
          });
          setDarajaUserPaybillInitial({
            enabled: nextUserPaybill.enabled !== false,
            environment: nextUserPaybill.environment === "production" ? "production" : "sandbox",
            shortcode: nextUserPaybill.shortcode || "",
            consumerKey: "",
            consumerSecret: "",
            passkey: "",
          });
        } else {
          toast.error(darajaData.message || "Failed to load Daraja integrations.");
        }
      } catch (error) {
        toast.error("Failed to load integrations.");
      } finally {
        setLoading(false);
      }
    };

    const fetchBanks = async () => {
      setBanksLoading(true);
      try {
        const res = await fetch("/api/owner/tuma/banks", { credentials: "include" });
        const data = await res.json();
        if (res.ok && data.success) {
          const list = Array.isArray(data.banks) ? data.banks : [];
          setBanks(list);
        } else {
          toast.error(data.message || "Failed to load Tuma banks.");
        }
      } catch {
        toast.error("Failed to load Tuma banks.");
      } finally {
        setBanksLoading(false);
      }
    };

    const fetchCsrf = async () => {
      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const data = await res.json();
        if (data.success && data.csrfToken) setCsrfToken(data.csrfToken);
      } catch {
        setCsrfToken(null);
      }
    };

    fetchIntegrations();
    fetchBanks();
    fetchCsrf();
  }, [router, canViewIntegrations]);

  const isDirty = useMemo(() => {
    const enabledDirty = tuma.enabled !== initial.enabled;
    const emailDirty = tuma.email.trim() !== initial.email;
    const apiKeyDirty = tumaApiKeyInput.trim().length > 0;
    return enabledDirty || emailDirty || apiKeyDirty;
  }, [tuma, initial, tumaApiKeyInput]);

  const isProvisioned = tuma.email.trim() && tuma.hasApiKey;
  const isConfigured = tuma.enabled && isProvisioned;
  const sharedProvisioned = darajaShared.hasDestinationNumber && !!darajaShared.destinationNumber.trim();
  const sharedConfigured = darajaShared.enabled && sharedProvisioned;
  const sharedDirty =
    darajaShared.enabled !== darajaSharedInitial.enabled ||
    darajaShared.paymentType !== darajaSharedInitial.paymentType ||
    darajaShared.destinationNumber.trim() !== darajaSharedInitial.destinationNumber.trim() ||
    darajaShared.accountReference.trim() !== darajaSharedInitial.accountReference.trim();
  const userPaybillProvisioned = darajaUserPaybill.hasCredentials;
  const userPaybillConfigured = darajaUserPaybill.enabled && userPaybillProvisioned;
  const userPaybillDirty =
    darajaUserPaybill.enabled !== darajaUserPaybillInitial.enabled ||
    darajaUserPaybill.environment !== darajaUserPaybillInitial.environment ||
    darajaUserPaybill.shortcode.trim() !== darajaUserPaybillInitial.shortcode.trim() ||
    darajaUserPaybill.consumerKey.trim().length > 0 ||
    darajaUserPaybill.consumerSecret.trim().length > 0 ||
    darajaUserPaybill.passkey.trim().length > 0;

  const statusLabel = loading
    ? "Checking connection..."
    : isConfigured
      ? isDirty
        ? "Configured - Unsaved changes"
        : "Configured"
      : isProvisioned
        ? "Configured (Disabled)"
        : "Not configured";

  const tumaCardDescription = isProvisioned
    ? "Manage Tuma settings and tenant payment routing."
    : "Create a Tuma profile to start collecting tenant payments.";
  const tumaCta = isConfigured ? "Manage Tuma" : isProvisioned ? "Finish setup" : "Create profile";
  const sharedCardDescription = sharedConfigured
    ? "Route payments through the shared Daraja setup and your connected Till or Paybill."
    : "Connect a Till or Paybill for the shared Daraja mode.";
  const sharedCta = sharedConfigured ? "Manage Shared Daraja" : sharedProvisioned ? "Finish setup" : "Connect shared mode";
  const userPaybillCardDescription = userPaybillConfigured
    ? "Store your own Daraja credentials per tenant and use them for STK Push."
    : "Save your own Safaricom Paybill credentials with encrypted tenant storage.";
  const userPaybillCta = userPaybillConfigured
    ? "Manage Paybill"
    : userPaybillProvisioned
      ? "Finish setup"
      : "Connect paybill";

  const integrationCards = useMemo<IntegrationCard[]>(() => {
    const tumaBadgeLabel = isConfigured ? "Connected" : isProvisioned ? "Available" : "Setup required";
    const sharedBadgeLabel = sharedConfigured ? "Connected" : sharedProvisioned ? "Available" : "Setup required";
    const userPaybillBadgeLabel = userPaybillConfigured
      ? "Connected"
      : userPaybillProvisioned
        ? "Available"
        : "Setup required";
    return [
      {
        id: "tuma",
        name: "Tuma Gateway",
        description: tumaCardDescription,
        status: isConfigured ? "connected" : "available",
        badgeLabel: tumaBadgeLabel,
        cta: tumaCta,
        icon: PlugZap,
        logoSrc: "/brand/tuma.png",
        logoAlt: "Tuma",
        logoClassName: "h-7",
      },
      {
        id: "daraja-shared",
        name: "Shared Daraja",
        description: sharedCardDescription,
        status: sharedConfigured ? "connected" : "available",
        badgeLabel: sharedBadgeLabel,
        cta: sharedCta,
        icon: Landmark,
      },
      {
        id: "daraja-user-paybill",
        name: "User-owned Paybill",
        description: userPaybillCardDescription,
        status: userPaybillConfigured ? "connected" : "available",
        badgeLabel: userPaybillBadgeLabel,
        cta: userPaybillCta,
        icon: Wallet,
      },
      ...comingSoonIntegrations,
    ];
  }, [
    isConfigured,
    isProvisioned,
    sharedConfigured,
    sharedProvisioned,
    userPaybillConfigured,
    userPaybillProvisioned,
    tumaCardDescription,
    sharedCardDescription,
    userPaybillCardDescription,
  ]);

  const openIntegrationModal = (integration: IntegrationCard) => {
    setSelectedIntegration(integration);
    if (integration.id === "daraja-shared") {
      setDarajaSharedErrors({});
    } else if (integration.id === "daraja-user-paybill") {
      setDarajaUserPaybillErrors({});
    }
    setShowModal(true);
  };

  const closeIntegrationModal = () => {
    setShowModal(false);
    setSelectedIntegration(null);
    setDarajaSharedErrors({});
    setDarajaUserPaybillErrors({});
    setShowDarajaSecrets(false);
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isReadOnly) {
      toast.error("You do not have permission to edit integrations.");
      return;
    }

    if (!csrfToken) {
      toast.error("Missing CSRF token. Please refresh and try again.");
      return;
    }

    const trimmedEmail = tuma.email.trim();
    const trimmedApiKey = tumaApiKeyInput.trim();
    const nextErrors: { email?: string; apiKey?: string } = {};

    if (tuma.enabled) {
      if (!trimmedEmail) {
        nextErrors.email = "Email is required when Tuma is enabled.";
      }
      if (!tuma.hasApiKey && !trimmedApiKey) {
        nextErrors.apiKey = "API key is required when enabling Tuma.";
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setTumaErrors(nextErrors);
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/owner/integrations", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          tuma: {
            enabled: tuma.enabled,
            email: trimmedEmail,
            ...(trimmedApiKey ? { apiKey: trimmedApiKey } : {}),
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to update integrations.");
        return;
      }

      const updated = data.integrations?.tuma || {};
      setTuma({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        maskedApiKey: updated.maskedApiKey || "",
        businessId: updated.businessId || "",
      });
      setInitial({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        businessId: updated.businessId || "",
      });
      setTumaErrors({});
      setTumaApiKeyInput("");
      toast.success("Tuma integration saved successfully.");
    } catch {
      toast.error("Failed to update integrations.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBusiness = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isReadOnly) {
      toast.error("You do not have permission to create a Tuma business.");
      return;
    }

    if (!csrfToken) {
      toast.error("Missing CSRF token. Please refresh and try again.");
      return;
    }

    if (!tumaForm.name.trim()) {
      toast.error("Please provide the business name.");
      return;
    }
    if (!tumaForm.email.trim()) {
      toast.error("Please provide the business email.");
      return;
    }
    if (!tumaForm.mobile.trim()) {
      toast.error("Please provide the mobile number in 254XXXXXXXXX format.");
      return;
    }
    if (!tumaForm.bankId.trim()) {
      toast.error("Please select a bank.");
      return;
    }
    if (!tumaForm.accountNumber.trim()) {
      toast.error("Please provide the bank account number.");
      return;
    }

    setTumaFormErrors({});
    setCreating(true);
    try {
      const res = await fetch("/api/owner/tuma/business", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          name: tumaForm.name.trim(),
          email: tumaForm.email.trim(),
          mobile: tumaForm.mobile.trim(),
          bankId: tumaForm.bankId.trim(),
          accountNumber: tumaForm.accountNumber.trim(),
          logo: tumaForm.logo.trim(),
          description: tumaForm.description.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        const fieldErrors = data?.errors?.fieldErrors || {};
        const nextErrors: Partial<Record<keyof TumaBusinessForm, string>> = {};
        (Object.keys(fieldErrors) as Array<keyof TumaBusinessForm>).forEach((key) => {
          const messages = fieldErrors[key];
          if (Array.isArray(messages) && messages[0]) {
            nextErrors[key] = messages[0];
          }
        });

        if (Object.keys(nextErrors).length > 0) {
          setTumaFormErrors(nextErrors);
          toast.error("Please fix the highlighted fields.");
        } else {
          toast.error(data.message || "Failed to create Tuma business.");
        }
        return;
      }

      const updated = data.integrations?.tuma || {};
      setTuma({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        maskedApiKey: updated.maskedApiKey || "",
        businessId: updated.businessId || "",
      });
      setInitial({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        businessId: updated.businessId || "",
      });
      setTumaFormErrors({});
      setTumaErrors({});
      setTumaApiKeyInput("");
      toast.success(data.message || "Tuma business created successfully.");
    } catch {
      toast.error("Failed to create Tuma business.");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCredentials = async () => {
    if (isReadOnly) {
      toast.error("You do not have permission to delete integrations.");
      return;
    }

    if (!csrfToken) {
      toast.error("Missing CSRF token. Please refresh and try again.");
      return;
    }

    const confirmed = window.confirm(
      "This will remove your Tuma API key and business profile from this account. You will need to create it again to receive payments. Continue?"
    );
    if (!confirmed) return;

    setSaving(true);
    try {
      const res = await fetch("/api/owner/integrations", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to delete integrations.");
        return;
      }

      const updated = data.integrations?.tuma || {};
      setTuma({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        maskedApiKey: updated.maskedApiKey || "",
        businessId: updated.businessId || "",
      });
      setInitial({
        enabled: updated.enabled !== false,
        email: updated.email || "",
        hasApiKey: !!updated.hasApiKey,
        businessId: updated.businessId || "",
      });
      setTumaErrors({});
      setTumaApiKeyInput("");
      toast.success(data.message || "Tuma credentials deleted.");
    } catch {
      toast.error("Failed to delete integrations.");
    } finally {
      setSaving(false);
    }
  };

  const applyDarajaSharedResponse = (updated: any) => {
    setDarajaShared({
      enabled: updated.enabled !== false,
      paymentType: updated.paymentType === "till" ? "till" : "paybill",
      destinationNumber: updated.destinationNumber || "",
      maskedDestinationNumber: updated.maskedDestinationNumber || "",
      accountReference: updated.accountReference || "",
      hasDestinationNumber: !!updated.hasDestinationNumber,
    });
    setDarajaSharedInitial({
      enabled: updated.enabled !== false,
      paymentType: updated.paymentType === "till" ? "till" : "paybill",
      destinationNumber: updated.destinationNumber || "",
      accountReference: updated.accountReference || "",
    });
  };

  const applyDarajaUserPaybillResponse = (updated: any) => {
    setDarajaUserPaybill({
      enabled: updated.enabled !== false,
      environment: updated.environment === "production" ? "production" : "sandbox",
      shortcode: updated.shortcode || "",
      consumerKey: "",
      consumerSecret: "",
      passkey: "",
      maskedShortcode: updated.maskedShortcode || "",
      maskedConsumerKey: updated.maskedConsumerKey || "",
      hasCredentials: !!updated.hasCredentials,
    });
    setDarajaUserPaybillInitial({
      enabled: updated.enabled !== false,
      environment: updated.environment === "production" ? "production" : "sandbox",
      shortcode: updated.shortcode || "",
      consumerKey: "",
      consumerSecret: "",
      passkey: "",
    });
  };

  const handleSaveDarajaShared = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isReadOnly) {
      toast.error("You do not have permission to edit integrations.");
      return;
    }
    if (!csrfToken) {
      toast.error("Missing CSRF token. Please refresh and try again.");
      return;
    }

    const destinationNumber = darajaShared.destinationNumber.trim();
    const accountReference = darajaShared.accountReference.trim();
    const nextErrors: Partial<Record<keyof DarajaSharedState, string>> = {};

    if (darajaShared.enabled) {
      if (!destinationNumber) {
        nextErrors.destinationNumber = "Till or Paybill number is required.";
      }
      if (!accountReference) {
        nextErrors.accountReference = "Account reference is required.";
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setDarajaSharedErrors(nextErrors);
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setDarajaSavingMode("shared_daraja");
    try {
      const res = await fetch("/api/owner/daraja", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          mode: "shared_daraja",
          enabled: darajaShared.enabled,
          paymentType: darajaShared.paymentType,
          destinationNumber,
          accountReference,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to update shared Daraja.");
        return;
      }

      applyDarajaSharedResponse(data.integrations?.daraja?.shared || {});
      setDarajaSharedErrors({});
      toast.success(data.message || "Shared Daraja saved successfully.");
    } catch {
      toast.error("Failed to update shared Daraja.");
    } finally {
      setDarajaSavingMode(null);
    }
  };

  const handleSaveDarajaUserPaybill = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isReadOnly) {
      toast.error("You do not have permission to edit integrations.");
      return;
    }
    if (!csrfToken) {
      toast.error("Missing CSRF token. Please refresh and try again.");
      return;
    }

    const shortcode = darajaUserPaybill.shortcode.trim();
    const consumerKey = darajaUserPaybill.consumerKey.trim();
    const consumerSecret = darajaUserPaybill.consumerSecret.trim();
    const passkey = darajaUserPaybill.passkey.trim();
    const nextErrors: Partial<Record<keyof DarajaUserPaybillState, string>> = {};

    if (darajaUserPaybill.enabled) {
      if (!darajaUserPaybill.hasCredentials && !shortcode) {
        nextErrors.shortcode = "Paybill shortcode is required.";
      }
      if (!darajaUserPaybill.hasCredentials && !consumerKey) {
        nextErrors.consumerKey = "Consumer Key is required.";
      }
      if (!darajaUserPaybill.hasCredentials && !consumerSecret) {
        nextErrors.consumerSecret = "Consumer Secret is required.";
      }
      if (!darajaUserPaybill.hasCredentials && !passkey) {
        nextErrors.passkey = "Passkey is required.";
      }
    }

    if (Object.keys(nextErrors).length > 0) {
      setDarajaUserPaybillErrors(nextErrors);
      toast.error("Please fix the highlighted fields.");
      return;
    }

    setDarajaSavingMode("user_paybill");
    try {
      const res = await fetch("/api/owner/daraja", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({
          mode: "user_paybill",
          enabled: darajaUserPaybill.enabled,
          environment: darajaUserPaybill.environment,
          shortcode,
          consumerKey,
          consumerSecret,
          passkey,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to update Paybill credentials.");
        return;
      }

      applyDarajaUserPaybillResponse(data.integrations?.daraja?.userPaybill || {});
      setDarajaUserPaybillErrors({});
      setShowDarajaSecrets(false);
      toast.success(data.message || "Paybill credentials saved successfully.");
    } catch {
      toast.error("Failed to update Paybill credentials.");
    } finally {
      setDarajaSavingMode(null);
    }
  };

  const handleDeleteDaraja = async (mode: DarajaMode) => {
    if (isReadOnly) {
      toast.error("You do not have permission to delete integrations.");
      return;
    }

    if (!csrfToken) {
      toast.error("Missing CSRF token. Please refresh and try again.");
      return;
    }

    const message =
      mode === "shared_daraja"
        ? "This will remove your shared Daraja connection. Continue?"
        : "This will remove your saved Paybill credentials. Continue?";
    const confirmed = window.confirm(message);
    if (!confirmed) return;

    setDarajaSavingMode(mode);
    try {
      const res = await fetch("/api/owner/daraja", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ mode }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        toast.error(data.message || "Failed to delete Daraja integration.");
        return;
      }

      const updated = data.integrations?.daraja || {};
      if (mode === "shared_daraja") {
        applyDarajaSharedResponse(updated.shared || {});
      } else {
        applyDarajaUserPaybillResponse(updated.userPaybill || {});
      }
      setDarajaSharedErrors({});
      setDarajaUserPaybillErrors({});
      setShowDarajaSecrets(false);
      toast.success(data.message || "Daraja integration removed.");
    } catch {
      toast.error("Failed to delete Daraja integration.");
    } finally {
      setDarajaSavingMode(null);
    }
  };

  const renderStatusBadge = (status: IntegrationStatus, labelOverride?: string) => {
    if (status === "connected") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
          <CheckCircle2 size={12} />
          {labelOverride || "Connected"}
        </span>
      );
    }
    if (status === "coming_soon") {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700">
          <Clock size={12} />
          {labelOverride || "Coming soon"}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold text-amber-700">
        <Clock size={12} />
        {labelOverride || "Available"}
      </span>
    );
  };

  return (
    <div className="min-h-[100svh] bg-background text-foreground">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Navbar />
      <Sidebar />

      <div className="md:ml-72 pt-16 pb-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-8">
          <section className="glass-panel rounded-3xl p-6 sm:p-8">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-11 h-11 bg-primary/10 rounded-2xl flex items-center justify-center shadow-sm">
                  <PlugZap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Owner Portal</p>
                  <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Integrations</h1>
                  <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                    Connect payment providers and manage API credentials.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {isFree && (
            <div className="surface-card rounded-2xl p-5 sm:p-6 border border-amber-200 bg-amber-50/60">
              <p className="text-[11px] uppercase tracking-[0.3em] text-amber-700/80">Premium only</p>
              <h2 className="mt-1 text-sm sm:text-base font-semibold text-foreground">
                Integrations are locked on Free tier
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
                Upgrade to Premium to connect payment providers and enable automated tenant payments.
              </p>
              <a
                href="/upgrade"
                className="mt-4 inline-flex items-center justify-center rounded-xl bg-amber-600 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow hover:bg-amber-700"
              >
                Upgrade
              </a>
            </div>
          )}

          <PremiumGate
            locked={isFree}
            title="Upgrade to unlock integrations"
            message="Connect payment providers, manage API keys, and automate collections with Premium."
          >
          <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {loading ? (
              [...Array(6)].map((_, i) => (
                <div key={i} className="surface-card rounded-3xl p-6 animate-pulse" />
              ))
            ) : (
              integrationCards.map((integration) => {
                const Icon = integration.icon;
                const buttonLabel =
                  integration.cta ||
                  (integration.status === "coming_soon"
                    ? "View details"
                    : integration.status === "connected"
                      ? "Manage"
                      : "Connect");
                return (
                  <div key={integration.id} className="surface-card rounded-3xl p-6 flex flex-col gap-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-white/80 shadow-sm">
                          {integration.logoSrc ? (
                            <img
                              src={integration.logoSrc}
                              alt={integration.logoAlt || integration.name}
                              className={integration.logoClassName || "h-6"}
                            />
                          ) : (
                            <Icon size={18} className="text-primary" />
                          )}
                        </div>
                        <h3 className="text-base sm:text-lg font-semibold text-foreground">{integration.name}</h3>
                        <p className="text-xs text-muted-foreground mt-1">{integration.description}</p>
                      </div>
                      {renderStatusBadge(integration.status, integration.badgeLabel)}
                    </div>
                    <button
                      onClick={() => openIntegrationModal(integration)}
                      className="mt-auto inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                    >
                      {buttonLabel}
                      <ArrowRight size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </section>
          </PremiumGate>

          <Modal
            title={selectedIntegration?.name || "Integration"}
            isOpen={showModal && !!selectedIntegration}
            onClose={closeIntegrationModal}
            className="max-w-3xl"
          >
            {selectedIntegration?.id === "daraja-shared" ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Integration status</p>
                    <p className="text-sm font-semibold text-foreground mt-2">
                      {sharedConfigured
                        ? sharedDirty
                          ? "Configured - Unsaved changes"
                          : "Configured"
                        : sharedProvisioned
                          ? "Configured (Disabled)"
                          : "Not configured"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Shared Daraja uses the SaaS-owned Daraja app credentials and stores the tenant&apos;s receiving
                      Till or Paybill securely.
                    </p>
                  </div>
                  {renderStatusBadge(
                    sharedConfigured ? "connected" : "available",
                    sharedConfigured ? "Connected" : sharedProvisioned ? "Available" : "Setup required"
                  )}
                </div>

                {isReadOnly && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    You have read-only access. Contact an owner admin to update integrations.
                  </div>
                )}

                <div className="rounded-2xl border border-sky-200 bg-sky-50/70 p-4 text-xs text-sky-800">
                  <p className="font-semibold">Shared mode</p>
                  <p className="mt-1">
                    Configure the tenant&apos;s destination number and account reference here. The app will keep the
                    record tenant-scoped for payment initiation and callback reconciliation.
                  </p>
                </div>

                <form onSubmit={handleSaveDarajaShared} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-white/80 p-4">
                      <label className="text-xs font-medium text-muted-foreground">Enable Shared Daraja</label>
                      <select
                        value={darajaShared.enabled ? "yes" : "no"}
                        onChange={(e) =>
                          setDarajaShared((prev) => ({ ...prev, enabled: e.target.value === "yes" }))
                        }
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                      >
                        <option value="yes">Enabled</option>
                        <option value="no">Disabled</option>
                      </select>
                    </div>

                    <div className="rounded-2xl border border-border bg-white/80 p-4">
                      <label className="text-xs font-medium text-muted-foreground">Payment Type</label>
                      <select
                        value={darajaShared.paymentType}
                        onChange={(e) =>
                          setDarajaShared((prev) => ({ ...prev, paymentType: e.target.value as DarajaPaymentType }))
                        }
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                      >
                        <option value="paybill">Paybill</option>
                        <option value="till">Till</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">
                        Connected Till / Paybill Number
                      </label>
                      <input
                        type="text"
                        value={darajaShared.destinationNumber}
                        onChange={(e) => {
                          setDarajaShared((prev) => ({ ...prev, destinationNumber: e.target.value }));
                          if (darajaSharedErrors.destinationNumber) {
                            setDarajaSharedErrors((prev) => ({ ...prev, destinationNumber: undefined }));
                          }
                        }}
                        disabled={isReadOnly}
                        className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                          darajaSharedErrors.destinationNumber ? "border-rose-300" : "border-border"
                        }`}
                        placeholder="2547XXXXXXX or Till number"
                      />
                      {darajaSharedErrors.destinationNumber ? (
                        <p className="text-[11px] text-rose-600 mt-1">{darajaSharedErrors.destinationNumber}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Stored securely and used to map payment callbacks back to the right tenant.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Account Reference</label>
                      <input
                        type="text"
                        value={darajaShared.accountReference}
                        onChange={(e) => {
                          setDarajaShared((prev) => ({ ...prev, accountReference: e.target.value }));
                          if (darajaSharedErrors.accountReference) {
                            setDarajaSharedErrors((prev) => ({ ...prev, accountReference: undefined }));
                          }
                        }}
                        disabled={isReadOnly}
                        className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                          darajaSharedErrors.accountReference ? "border-rose-300" : "border-border"
                        }`}
                        placeholder="Reference shown on STK prompt"
                      />
                      {darajaSharedErrors.accountReference ? (
                        <p className="text-[11px] text-rose-600 mt-1">{darajaSharedErrors.accountReference}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          This reference should identify the tenant, invoice, or booking clearly.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={isReadOnly || darajaSavingMode === "shared_daraja" || !sharedDirty}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      {darajaSavingMode === "shared_daraja" ? "Saving..." : "Save integration"}
                    </button>
                    {sharedProvisioned && (
                      <button
                        type="button"
                        onClick={() => handleDeleteDaraja("shared_daraja")}
                        disabled={isReadOnly || darajaSavingMode === "shared_daraja"}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Delete settings
                      </button>
                    )}
                  </div>
                </form>
              </div>
            ) : selectedIntegration?.id === "daraja-user-paybill" ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Integration status</p>
                    <p className="text-sm font-semibold text-foreground mt-2">
                      {userPaybillConfigured
                        ? userPaybillDirty
                          ? "Configured - Unsaved changes"
                          : "Configured"
                        : userPaybillProvisioned
                          ? "Configured (Disabled)"
                          : "Not configured"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Save the tenant&apos;s own Safaricom Paybill credentials and use them for STK Push.
                    </p>
                  </div>
                  {renderStatusBadge(
                    userPaybillConfigured ? "connected" : "available",
                    userPaybillConfigured ? "Connected" : userPaybillProvisioned ? "Available" : "Setup required"
                  )}
                </div>

                {isReadOnly && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    You have read-only access. Contact an owner admin to update integrations.
                  </div>
                )}

                <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 text-xs text-violet-800">
                  <p className="font-semibold">Encrypted storage</p>
                  <p className="mt-1">
                    Tenant credentials are encrypted at rest. Use sandbox or production per tenant depending on the
                    Daraja app configuration.
                  </p>
                </div>

                <form onSubmit={handleSaveDarajaUserPaybill} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-white/80 p-4">
                      <label className="text-xs font-medium text-muted-foreground">Enable Paybill Mode</label>
                      <select
                        value={darajaUserPaybill.enabled ? "yes" : "no"}
                        onChange={(e) =>
                          setDarajaUserPaybill((prev) => ({ ...prev, enabled: e.target.value === "yes" }))
                        }
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                      >
                        <option value="yes">Enabled</option>
                        <option value="no">Disabled</option>
                      </select>
                    </div>

                    <div className="rounded-2xl border border-border bg-white/80 p-4">
                      <label className="text-xs font-medium text-muted-foreground">Environment</label>
                      <select
                        value={darajaUserPaybill.environment}
                        onChange={(e) =>
                          setDarajaUserPaybill((prev) => ({
                            ...prev,
                            environment: e.target.value === "production" ? "production" : "sandbox",
                          }))
                        }
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                      >
                        <option value="sandbox">Sandbox</option>
                        <option value="production">Production</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Shortcode / Paybill</label>
                      <input
                        type="text"
                        value={darajaUserPaybill.shortcode}
                        onChange={(e) => {
                          setDarajaUserPaybill((prev) => ({ ...prev, shortcode: e.target.value }));
                          if (darajaUserPaybillErrors.shortcode) {
                            setDarajaUserPaybillErrors((prev) => ({ ...prev, shortcode: undefined }));
                          }
                        }}
                        disabled={isReadOnly}
                        className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                          darajaUserPaybillErrors.shortcode ? "border-rose-300" : "border-border"
                        }`}
                        placeholder={darajaUserPaybill.hasCredentials ? darajaUserPaybill.maskedShortcode || "Stored" : "Enter shortcode"}
                      />
                      {darajaUserPaybillErrors.shortcode ? (
                        <p className="text-[11px] text-rose-600 mt-1">{darajaUserPaybillErrors.shortcode}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {darajaUserPaybill.hasCredentials
                            ? `Stored securely as ${darajaUserPaybill.maskedShortcode || "configured"}`
                            : "This is usually the Paybill number assigned by Safaricom."}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Consumer Key</label>
                      <input
                        type="text"
                        value={darajaUserPaybill.consumerKey}
                        onChange={(e) => {
                          setDarajaUserPaybill((prev) => ({ ...prev, consumerKey: e.target.value }));
                          if (darajaUserPaybillErrors.consumerKey) {
                            setDarajaUserPaybillErrors((prev) => ({ ...prev, consumerKey: undefined }));
                          }
                        }}
                        disabled={isReadOnly}
                        className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                          darajaUserPaybillErrors.consumerKey ? "border-rose-300" : "border-border"
                        }`}
                        placeholder={darajaUserPaybill.hasCredentials ? "Leave blank to keep current key" : "Enter Consumer Key"}
                      />
                      {darajaUserPaybillErrors.consumerKey ? (
                        <p className="text-[11px] text-rose-600 mt-1">{darajaUserPaybillErrors.consumerKey}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {darajaUserPaybill.hasCredentials
                            ? `Current key is masked as ${darajaUserPaybill.maskedConsumerKey || "configured"}`
                            : "This is not the secret key."}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Consumer Secret</label>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type={showDarajaSecrets ? "text" : "password"}
                          value={darajaUserPaybill.consumerSecret}
                          onChange={(e) => {
                            setDarajaUserPaybill((prev) => ({ ...prev, consumerSecret: e.target.value }));
                            if (darajaUserPaybillErrors.consumerSecret) {
                              setDarajaUserPaybillErrors((prev) => ({ ...prev, consumerSecret: undefined }));
                            }
                          }}
                          disabled={isReadOnly}
                          className={`w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                            darajaUserPaybillErrors.consumerSecret ? "border-rose-300" : "border-border"
                          }`}
                          placeholder={darajaUserPaybill.hasCredentials ? "Leave blank to keep current secret" : "Enter Consumer Secret"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowDarajaSecrets((prev) => !prev)}
                          disabled={isReadOnly}
                          className="whitespace-nowrap rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {showDarajaSecrets ? "Hide" : "Reveal"}
                        </button>
                      </div>
                      {darajaUserPaybillErrors.consumerSecret ? (
                        <p className="text-[11px] text-rose-600 mt-1">{darajaUserPaybillErrors.consumerSecret}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Stored encrypted at rest. Leave blank to preserve the current secret.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Passkey</label>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type={showDarajaSecrets ? "text" : "password"}
                          value={darajaUserPaybill.passkey}
                          onChange={(e) => {
                            setDarajaUserPaybill((prev) => ({ ...prev, passkey: e.target.value }));
                            if (darajaUserPaybillErrors.passkey) {
                              setDarajaUserPaybillErrors((prev) => ({ ...prev, passkey: undefined }));
                            }
                          }}
                          disabled={isReadOnly}
                          className={`w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                            darajaUserPaybillErrors.passkey ? "border-rose-300" : "border-border"
                          }`}
                          placeholder={darajaUserPaybill.hasCredentials ? "Leave blank to keep current passkey" : "Enter Passkey"}
                        />
                        <button
                          type="button"
                          onClick={() => setShowDarajaSecrets((prev) => !prev)}
                          disabled={isReadOnly}
                          className="whitespace-nowrap rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {showDarajaSecrets ? "Hide" : "Reveal"}
                        </button>
                      </div>
                      {darajaUserPaybillErrors.passkey ? (
                        <p className="text-[11px] text-rose-600 mt-1">{darajaUserPaybillErrors.passkey}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          The passkey is stored encrypted and used only on the server.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={isReadOnly || darajaSavingMode === "user_paybill" || !userPaybillDirty}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      {darajaSavingMode === "user_paybill" ? "Saving..." : "Save integration"}
                    </button>
                    {userPaybillProvisioned && (
                      <button
                        type="button"
                        onClick={() => handleDeleteDaraja("user_paybill")}
                        disabled={isReadOnly || darajaSavingMode === "user_paybill"}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Delete credentials
                      </button>
                    )}
                  </div>
                </form>
              </div>
            ) : selectedIntegration?.id === "tuma" ? (
              <div className="space-y-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Integration status</p>
                    <p className="text-sm font-semibold text-foreground mt-2">{statusLabel}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Enable Tuma to collect tenant payments via STK push.
                    </p>
                  </div>
                  {renderStatusBadge(
                    isConfigured ? "connected" : "available",
                    isConfigured ? "Connected" : isProvisioned ? "Available" : "Setup required"
                  )}
                </div>

                {isReadOnly && (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    You have read-only access. Contact an owner admin to update integrations.
                  </div>
                )}

                <form onSubmit={handleSave} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-border bg-white/80 p-4">
                      <label className="text-xs font-medium text-muted-foreground">Enable Tuma</label>
                      <select
                        value={tuma.enabled ? "yes" : "no"}
                        onChange={(e) =>
                          setTuma((prev) => ({ ...prev, enabled: e.target.value === "yes" }))
                        }
                        disabled={isReadOnly}
                        className="mt-2 w-full rounded-xl border border-border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                      >
                        <option value="yes">Enabled</option>
                        <option value="no">Disabled</option>
                      </select>
                    </div>

                    <div className="rounded-2xl border border-border bg-white/80 p-4">
                      <label className="text-xs font-medium text-muted-foreground">API Key</label>
                      <p className="mt-3 text-sm font-semibold text-foreground">
                        {tuma.hasApiKey ? tuma.maskedApiKey || "Configured" : "Not set"}
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          type={showApiKey ? "text" : "password"}
                          value={tumaApiKeyInput}
                          onChange={(e) => {
                            setTumaApiKeyInput(e.target.value);
                            if (tumaErrors.apiKey) {
                              setTumaErrors((prev) => ({ ...prev, apiKey: undefined }));
                            }
                          }}
                          disabled={isReadOnly}
                          className={`w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                            tumaErrors.apiKey ? "border-rose-300" : "border-border"
                          }`}
                          placeholder="Paste a new API key to update"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey((prev) => !prev)}
                          disabled={isReadOnly}
                          className="whitespace-nowrap rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          {showApiKey ? "Hide" : "Reveal"}
                        </button>
                      </div>
                      {tumaErrors.apiKey ? (
                        <p className="text-[11px] text-rose-600 mt-1">{tumaErrors.apiKey}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground mt-1">
                          Leave blank to keep the current key. You can copy a new key from the Tuma portal.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Tuma Business Email</label>
                      <input
                        type="email"
                        value={tuma.email}
                        onChange={(e) => {
                          setTuma((prev) => ({ ...prev, email: e.target.value }));
                          if (tumaErrors.email) {
                            setTumaErrors((prev) => ({ ...prev, email: undefined }));
                          }
                        }}
                        disabled={isReadOnly}
                        className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                          tumaErrors.email ? "border-rose-300" : "border-border"
                        }`}
                        placeholder="Not created yet"
                      />
                      {tumaErrors.email ? (
                        <p className="text-[11px] text-rose-600 mt-1">{tumaErrors.email}</p>
                      ) : (
                        <p className="text-[11px] text-muted-foreground mt-1">
                          Update the email to match what you see in the Tuma portal.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Tuma Business ID</label>
                      <input
                        type="text"
                        value={tuma.businessId}
                        disabled
                        className="mt-2 w-full rounded-xl border border-border bg-white/70 px-3 py-2 text-sm text-muted-foreground"
                        placeholder="Not created yet"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="submit"
                      disabled={isReadOnly || saving || !isDirty}
                      className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save integration"}
                    </button>
                    {tuma.hasApiKey && (
                      <button
                        type="button"
                        onClick={handleDeleteCredentials}
                        disabled={isReadOnly || saving}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Delete credentials
                      </button>
                    )}
                  </div>
                </form>

                {!isProvisioned && (
                  <div className="rounded-3xl border border-border bg-white/70 p-5">
                    <h3 className="text-base font-semibold text-foreground">Create a Tuma business profile</h3>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Enter your business and banking details. We will create a child profile and save the API key automatically.
                    </p>
                    <form onSubmit={handleCreateBusiness} className="mt-5 space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Business Name</label>
                          <input
                            type="text"
                            value={tumaForm.name}
                            onChange={(e) => {
                              setTumaForm((prev) => ({ ...prev, name: e.target.value }));
                              if (tumaFormErrors.name) {
                                setTumaFormErrors((prev) => ({ ...prev, name: undefined }));
                              }
                            }}
                            disabled={isReadOnly}
                            className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                              tumaFormErrors.name ? "border-rose-300" : "border-border"
                            }`}
                            placeholder="Your business name"
                          />
                          {tumaFormErrors.name && (
                            <p className="text-[11px] text-rose-600 mt-1">{tumaFormErrors.name}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Business Email</label>
                          <input
                            type="email"
                            value={tumaForm.email}
                            onChange={(e) => {
                              setTumaForm((prev) => ({ ...prev, email: e.target.value }));
                              if (tumaFormErrors.email) {
                                setTumaFormErrors((prev) => ({ ...prev, email: undefined }));
                              }
                            }}
                            disabled={isReadOnly}
                            className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                              tumaFormErrors.email ? "border-rose-300" : "border-border"
                            }`}
                            placeholder="billing@yourcompany.com"
                          />
                          {tumaFormErrors.email && (
                            <p className="text-[11px] text-rose-600 mt-1">{tumaFormErrors.email}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Mobile Number (254XXXXXXXXX)</label>
                          <input
                            type="tel"
                            value={tumaForm.mobile}
                            onChange={(e) => {
                              setTumaForm((prev) => ({ ...prev, mobile: e.target.value }));
                              if (tumaFormErrors.mobile) {
                                setTumaFormErrors((prev) => ({ ...prev, mobile: undefined }));
                              }
                            }}
                            disabled={isReadOnly}
                            className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                              tumaFormErrors.mobile ? "border-rose-300" : "border-border"
                            }`}
                            placeholder="254712345678"
                          />
                          {tumaFormErrors.mobile && (
                            <p className="text-[11px] text-rose-600 mt-1">{tumaFormErrors.mobile}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Bank</label>
                          <select
                            value={tumaForm.bankId}
                            onChange={(e) => {
                              setTumaForm((prev) => ({ ...prev, bankId: e.target.value }));
                              if (tumaFormErrors.bankId) {
                                setTumaFormErrors((prev) => ({ ...prev, bankId: undefined }));
                              }
                            }}
                            disabled={isReadOnly || banksLoading}
                            className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                              tumaFormErrors.bankId ? "border-rose-300" : "border-border"
                            }`}
                          >
                            <option value="">
                              {banksLoading ? "Loading banks..." : "Select a bank"}
                            </option>
                            {banks.map((bank) => (
                              <option key={bank.id} value={bank.id}>
                                {bank.name}
                              </option>
                            ))}
                          </select>
                          {tumaFormErrors.bankId && (
                            <p className="text-[11px] text-rose-600 mt-1">{tumaFormErrors.bankId}</p>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Bank Account Number</label>
                          <input
                            type="text"
                            value={tumaForm.accountNumber}
                            onChange={(e) => {
                              setTumaForm((prev) => ({ ...prev, accountNumber: e.target.value }));
                              if (tumaFormErrors.accountNumber) {
                                setTumaFormErrors((prev) => ({ ...prev, accountNumber: undefined }));
                              }
                            }}
                            disabled={isReadOnly}
                            className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                              tumaFormErrors.accountNumber ? "border-rose-300" : "border-border"
                            }`}
                            placeholder="1234567890"
                          />
                          {tumaFormErrors.accountNumber && (
                            <p className="text-[11px] text-rose-600 mt-1">{tumaFormErrors.accountNumber}</p>
                          )}
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Logo URL (optional)</label>
                          <input
                            type="url"
                            value={tumaForm.logo}
                            onChange={(e) => {
                              setTumaForm((prev) => ({ ...prev, logo: e.target.value }));
                              if (tumaFormErrors.logo) {
                                setTumaFormErrors((prev) => ({ ...prev, logo: undefined }));
                              }
                            }}
                            disabled={isReadOnly}
                            className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                              tumaFormErrors.logo ? "border-rose-300" : "border-border"
                            }`}
                            placeholder="https://yourdomain.com/logo.png"
                          />
                          {tumaFormErrors.logo && (
                            <p className="text-[11px] text-rose-600 mt-1">{tumaFormErrors.logo}</p>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Description (optional)</label>
                        <textarea
                          value={tumaForm.description}
                          onChange={(e) => {
                            setTumaForm((prev) => ({ ...prev, description: e.target.value }));
                            if (tumaFormErrors.description) {
                              setTumaFormErrors((prev) => ({ ...prev, description: undefined }));
                            }
                          }}
                          disabled={isReadOnly}
                          className={`mt-2 w-full rounded-xl border bg-white/80 px-3 py-2 text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors ${
                            tumaFormErrors.description ? "border-rose-300" : "border-border"
                          }`}
                          rows={3}
                          placeholder="Brief description of your business"
                        />
                        {tumaFormErrors.description && (
                          <p className="text-[11px] text-rose-600 mt-1">{tumaFormErrors.description}</p>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={isReadOnly || creating}
                        className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white hover:bg-primary-hover disabled:opacity-50"
                      >
                        {creating ? "Creating..." : "Create Tuma Business"}
                      </button>
                    </form>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4 text-sm text-muted-foreground">
                <p>
                  This integration is being prepared for owners. When it launches, you will connect and manage it right
                  here.
                </p>
                <div className="rounded-xl border border-border bg-white/70 px-3 py-3 text-xs text-muted-foreground">
                  <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Coming soon</p>
                  <p className="mt-2">
                    Reach out to support if you want early access or a custom rollout.
                  </p>
                </div>
              </div>
            )}
          </Modal>
        </main>
      </div>
    </div>
  );
}
