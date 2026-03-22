"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { Save, User, Lock, CreditCard, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast, { Toaster } from "react-hot-toast"; // Import react-hot-toast
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { usePermissions } from "@/hooks/usePermissions";
import ConnectMpesaForm from "@/components/ConnectMpesaForm";

export default function OwnerSettingsPage() {
  const router = useRouter();
  const perm = usePermissions();
  const canViewSettings = perm.hasPermission("settings:view");
  const canEditSettings = perm.hasPermission("settings:edit");
  const isReadOnly = !canEditSettings;
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [paymentSettings, setPaymentSettings] = useState({
    umsCommsEnabled: false,
    umsCommsApiKey: "",
    umsCommsAppId: "",
    umsCommsSenderId: "",
    stripeEnabled: false,
    stripeApiKey: "",
    paypalEnabled: false,
    paypalClientId: "",
    bankTransferEnabled: false,
    bankAccountDetails: "",
  });
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [expandedGateway, setExpandedGateway] = useState<string | null>(null);

  useEffect(() => {
    const id = Cookies.get("userId");
    const role = Cookies.get("role");
    const ownerIdFromCookie = Cookies.get("ownerId");

    if (!id || !["propertyOwner", "teamMember"].includes(role || "")) {
      console.log("[OwnerSettingsPage] Invalid userId or role:", { id, role });
      toast.error("Unauthorized access. Please log in as a property owner or team member.");
      router.replace("/login");
      return;
    }

    if (role === "teamMember" && !canViewSettings) {
      toast.error("Access restricted. You do not have permission to view settings.");
      router.replace("/property-owner-dashboard");
      return;
    }

    const ownerIdToUse = role === "propertyOwner" ? id : (ownerIdFromCookie || id);
    if (!ownerIdToUse) {
      toast.error("Could not determine property owner. Please log in again.");
      router.replace("/login");
      return;
    }

    setOwnerId(ownerIdToUse);

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/settings?ownerId=${ownerIdToUse}`);
        const data = await res.json();
        console.log("[OwnerSettingsPage] Fetch data response:", data);
        if (data.success) {
          setProfile(data.owner);
          setPaymentSettings({
            umsCommsEnabled: data.paymentSettings?.umsCommsEnabled || false,
            umsCommsApiKey: data.paymentSettings?.umsCommsApiKey || "",
            umsCommsAppId: data.paymentSettings?.umsCommsAppId || "",
            umsCommsSenderId: data.paymentSettings?.umsCommsSenderId || "UMS_SMS",
            stripeEnabled: data.paymentSettings?.stripeEnabled || false,
            stripeApiKey: data.paymentSettings?.stripeApiKey || "",
            paypalEnabled: data.paymentSettings?.paypalEnabled || false,
            paypalClientId: data.paymentSettings?.paypalClientId || "",
            bankTransferEnabled: data.paymentSettings?.bankTransferEnabled || false,
            bankAccountDetails: data.paymentSettings?.bankAccountDetails || "",
          });
          toast.success("Profile and settings loaded successfully!");
        } else {
          console.error("[OwnerSettingsPage] Failed to fetch data:", data.message);
          toast.error(`Failed to load profile: ${data.message}`);
        }
      } catch (err) {
        console.error("[OwnerSettingsPage] Error fetching data:", err);
        toast.error("An error occurred while loading profile.");
      }
    };

    fetchData();
  }, [router, canViewSettings]);

  const updateProfile = async () => {
    if (isReadOnly) {
      toast.error("You do not have permission to edit settings.");
      return;
    }
    setLoading(true);
    try {
      const payload = { ownerId, ...profile };
      console.log("[OwnerSettingsPage] Updating profile with payload:", payload);
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("[OwnerSettingsPage] Update profile response:", data);
      if (data.success) {
        toast.success("Profile updated successfully!");
      } else {
        toast.error(`Failed to update profile: ${data.message}`);
      }
    } catch (err) {
      console.error("[OwnerSettingsPage] Error updating profile:", err);
      toast.error("An error occurred while updating profile.");
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    if (isReadOnly) {
      toast.error("You do not have permission to edit settings.");
      return;
    }
    if (!password || password !== confirmPassword) {
      toast.error("Passwords do not match or are empty.");
      return;
    }
    try {
      const payload = { ownerId, password };
      console.log("[OwnerSettingsPage] Changing password with payload:", payload);
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("[OwnerSettingsPage] Change password response:", data);
      if (data.success) {
        toast.success("Password updated successfully!");
        setPassword("");
        setConfirmPassword("");
      } else {
        toast.error(`Failed to update password: ${data.message}`);
      }
    } catch (err) {
      console.error("[OwnerSettingsPage] Error changing password:", err);
      toast.error("An error occurred while updating password.");
    }
  };

  const updatePaymentSettings = async () => {
    if (isReadOnly) {
      toast.error("You do not have permission to edit settings.");
      return;
    }
    setPaymentLoading(true);
    try {
      if (
        paymentSettings.umsCommsEnabled &&
        (!paymentSettings.umsCommsApiKey ||
          !paymentSettings.umsCommsAppId ||
          !paymentSettings.umsCommsSenderId)
      ) {
        toast.error("Please provide all UMSComms details (API Key, App ID, Sender ID).");
        return;
      }
      if (paymentSettings.stripeEnabled && !paymentSettings.stripeApiKey) {
        toast.error("Please provide a Stripe API key.");
        return;
      }
      if (paymentSettings.paypalEnabled && !paymentSettings.paypalClientId) {
        toast.error("Please provide a PayPal Client ID.");
        return;
      }
      if (paymentSettings.bankTransferEnabled && !paymentSettings.bankAccountDetails) {
        toast.error("Please provide bank account details.");
        return;
      }

      const payload = { ownerId, ...paymentSettings };
      console.log("[OwnerSettingsPage] Updating payment settings with payload:", payload);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("[OwnerSettingsPage] Update payment settings response:", data);
      if (data.success) {
        toast.success("Payment settings updated successfully!");
      } else {
        toast.error(`Failed to update payment settings: ${data.message}`);
      }
    } catch (err) {
      console.error("[OwnerSettingsPage] Error updating payment settings:", err);
      toast.error("An error occurred while updating payment settings.");
    } finally {
      setPaymentLoading(false);
    }
  };

  const toggleGateway = (gateway: string) => {
    if (isReadOnly) return;
    setExpandedGateway(expandedGateway === gateway ? null : gateway);
  };

  return (
    <div className="min-h-screen">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        <main className="max-w-7xl mx-auto space-y-6 overflow-y-auto transition-all duration-300">
          <motion.section
            className="glass-panel rounded-3xl p-6 sm:p-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Settings size={20} className="text-primary" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Owner Portal</p>
                <h1 className="text-xl sm:text-2xl font-semibold text-foreground">Settings</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">Manage your profile and security preferences.</p>
              </div>
            </div>
          </motion.section>

          <motion.div
            className="surface-card rounded-2xl p-5 sm:p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <h2 className="text-base sm:text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
              <User className="text-primary" />
              Profile Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="text-xs font-medium text-gray-600">Full Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  disabled={isReadOnly}
                  className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Email</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  disabled={isReadOnly}
                  className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                  placeholder="Enter your email"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Phone</label>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  disabled={isReadOnly}
                  className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                  placeholder="Enter your phone number"
                />
              </div>
            </div>
            <button
              onClick={updateProfile}
              className="mt-6 bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2 transition-colors duration-200 disabled:opacity-50"
              disabled={loading || isReadOnly}
            >
              <Save size={14} />
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </motion.div>

          <motion.div
            className="surface-card rounded-2xl p-5 sm:p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <h2 className="text-base sm:text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
              <Lock className="text-primary" />
              Change Password
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="text-xs font-medium text-gray-600">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isReadOnly}
                  className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isReadOnly}
                  className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                  placeholder="Confirm new password"
                />
              </div>
            </div>
            <button
              onClick={changePassword}
              className="mt-6 bg-primary hover:bg-primary-hover text-white px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-colors duration-200 disabled:opacity-50"
            >
              Change Password
            </button>
          </motion.div>

          <motion.div
            className="surface-card rounded-2xl p-5 sm:p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <h2 className="text-base sm:text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
              <CreditCard className="text-primary" />
              Payment & Communication Settings
            </h2>
            <div className="space-y-4">
              <div className="border border-gray-200 rounded-2xl p-4 sm:p-5 bg-white/70 hover:shadow-md transition-shadow duration-200">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs sm:text-sm font-semibold text-gray-700">Safaricom Daraja (M-Pesa)</span>
                  </div>
                </div>
                <div className="mt-4">
                  <ConnectMpesaForm disabled={isReadOnly} />
                </div>
              </div>

              {/* UMSComms Settings */}
              <div className="border border-gray-200 rounded-2xl p-4 sm:p-5 bg-white/70 hover:shadow-md transition-shadow duration-200">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleGateway("umsComms")}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs sm:text-sm font-semibold text-gray-700">UMSComms (SMS)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                        paymentSettings.umsCommsEnabled ? "bg-primary" : "bg-gray-300"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (isReadOnly) return;
                        setPaymentSettings({ ...paymentSettings, umsCommsEnabled: !paymentSettings.umsCommsEnabled });
                      }}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                          paymentSettings.umsCommsEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </div>
                    {expandedGateway === "umsComms" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>
                <AnimatePresence>
                  {expandedGateway === "umsComms" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="mt-4 grid gap-4"
                    >
                      <div>
                        <label className="text-xs font-medium text-gray-600">UMSComms API Key</label>
                        <input
                          type="text"
                          value={paymentSettings.umsCommsApiKey}
                          onChange={(e) =>
                            setPaymentSettings({ ...paymentSettings, umsCommsApiKey: e.target.value })
                          }
                          placeholder="Enter UMSComms API Key"
                          className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                          disabled={!paymentSettings.umsCommsEnabled}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">UMSComms App ID</label>
                        <input
                          type="text"
                          value={paymentSettings.umsCommsAppId}
                          onChange={(e) =>
                            setPaymentSettings({ ...paymentSettings, umsCommsAppId: e.target.value })
                          }
                          placeholder="Enter UMSComms App ID"
                          className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                          disabled={!paymentSettings.umsCommsEnabled}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">UMSComms Sender ID</label>
                        <input
                          type="text"
                          value={paymentSettings.umsCommsSenderId}
                          onChange={(e) =>
                            setPaymentSettings({ ...paymentSettings, umsCommsSenderId: e.target.value })
                          }
                          placeholder="Enter UMSComms Sender ID (e.g., UMS_SMS)"
                          className="mt-2 w-full px-3 py-2.5 border border-gray-200 rounded-xl bg-white/80 text-xs sm:text-sm focus:ring-4 focus:ring-primary/30 focus:border-primary transition-colors"
                          disabled={!paymentSettings.umsCommsEnabled}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Find your API key and App ID in the{" "}
                        <a
                          href="https://comms.umeskiasoftwares.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#42c775] hover:underline"
                        >
                          UMSComms Dashboard
                        </a>.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
            <button
              onClick={updatePaymentSettings}
              className="mt-6 bg-[#42c775] hover:bg-[#34b46d] text-white px-5 py-2 rounded-lg flex items-center gap-2 transition-colors duration-200 disabled:opacity-50"
              disabled={paymentLoading || isReadOnly}
            >
              <Save size={16} />
              {paymentLoading ? "Saving..." : "Save Settings"}
            </button>
          </motion.div>
        </main>
      </div>
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
      `}</style>
    </div>
  );
}







