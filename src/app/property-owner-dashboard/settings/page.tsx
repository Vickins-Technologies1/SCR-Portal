"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { Save, User, Lock, CreditCard, Settings, ChevronDown, ChevronUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import toast, { Toaster } from "react-hot-toast"; // Import react-hot-toast
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

export default function OwnerSettingsPage() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [paymentSettings, setPaymentSettings] = useState({
    umsPayEnabled: false,
    umsPayApiKey: "",
    umsPayEmail: "",
    umsPayAccountId: "",
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
    if (!id || role !== "propertyOwner") {
      console.log("[OwnerSettingsPage] Invalid userId or role:", { id, role });
      toast.error("Unauthorized access. Please log in as a property owner.");
      return;
    }
    setOwnerId(id);

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/settings?ownerId=${id}`);
        const data = await res.json();
        console.log("[OwnerSettingsPage] Fetch data response:", data);
        if (data.success) {
          setProfile(data.owner);
          setPaymentSettings({
            umsPayEnabled: data.paymentSettings?.umsPayEnabled || false,
            umsPayApiKey: data.paymentSettings?.umsPayApiKey || "",
            umsPayEmail: data.paymentSettings?.umsPayEmail || data.owner?.email || "",
            umsPayAccountId: data.paymentSettings?.umsPayAccountId || "",
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
  }, []);

  const updateProfile = async () => {
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
    setPaymentLoading(true);
    try {
      if (
        paymentSettings.umsPayEnabled &&
        (!paymentSettings.umsPayApiKey ||
          !paymentSettings.umsPayEmail ||
          !paymentSettings.umsPayAccountId)
      ) {
        toast.error("Please provide all UMS Pay details (API Key, Email, Account ID).");
        return;
      }
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
    setExpandedGateway(expandedGateway === gateway ? null : gateway);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} /> {/* Add Toaster component */}
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-4 sm:px-6 lg:px-8 py-8 bg-gray-50 min-h-screen overflow-y-auto transition-all duration-300">
          <motion.h1
            className="text-2xl sm:text-3xl font-semibold text-gray-800 mb-8 flex items-center gap-2"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <Settings size={28} className="text-[#03a678]" />
            Settings
          </motion.h1>

          <motion.div
            className="bg-white rounded-xl shadow-sm border p-6 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800">
              <User className="text-[#012a4a]" />
              Profile Information
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="text-sm font-medium text-gray-600">Full Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent transition-colors"
                  placeholder="Enter your full name"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Email</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent transition-colors"
                  placeholder="Enter your email"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Phone</label>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent transition-colors"
                  placeholder="Enter your phone number"
                />
              </div>
            </div>
            <button
              onClick={updateProfile}
              className="mt-6 bg-[#03a678] hover:bg-[#02956a] text-white px-5 py-2 rounded-lg flex items-center gap-2 transition-colors duration-200 disabled:opacity-50"
              disabled={loading}
            >
              <Save size={16} />
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </motion.div>

          <motion.div
            className="bg-white rounded-xl shadow-sm border p-6 mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800">
              <Lock className="text-[#012a4a]" />
              Change Password
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <label className="text-sm font-medium text-gray-600">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent transition-colors"
                  placeholder="Enter new password"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent transition-colors"
                  placeholder="Confirm new password"
                />
              </div>
            </div>
            <button
              onClick={changePassword}
              className="mt-6 bg-[#012a4a] hover:bg-[#011d34] text-white px-5 py-2 rounded-lg transition-colors duration-200"
            >
              Change Password
            </button>
          </motion.div>

          <motion.div
            className="bg-white rounded-xl shadow-sm border p-6"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800">
              <CreditCard className="text-[#012a4a]" />
              Payment & Communication Settings
            </h2>
            <div className="space-y-4">
              {/* UMS Pay Settings */}
              <div className="border rounded-lg p-4 hover:shadow-md transition-shadow duration-200">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleGateway("umsPay")}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">UMS Pay (M-Pesa)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                        paymentSettings.umsPayEnabled ? "bg-[#03a678]" : "bg-gray-300"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setPaymentSettings({ ...paymentSettings, umsPayEnabled: !paymentSettings.umsPayEnabled });
                      }}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${
                          paymentSettings.umsPayEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </div>
                    {expandedGateway === "umsPay" ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                  </div>
                </div>
                <AnimatePresence>
                  {expandedGateway === "umsPay" && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="mt-4 grid gap-4"
                    >
                      <div>
                        <label className="text-xs font-medium text-gray-600">UMS Pay API Key</label>
                        <input
                          type="text"
                          value={paymentSettings.umsPayApiKey}
                          onChange={(e) =>
                            setPaymentSettings({ ...paymentSettings, umsPayApiKey: e.target.value })
                          }
                          placeholder="Enter UMS Pay API Key"
                          className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent transition-colors"
                          disabled={!paymentSettings.umsPayEnabled}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">UMS Pay Email</label>
                        <input
                          type="email"
                          value={paymentSettings.umsPayEmail}
                          onChange={(e) =>
                            setPaymentSettings({ ...paymentSettings, umsPayEmail: e.target.value })
                          }
                          placeholder="Enter UMS Pay Email"
                          className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent transition-colors"
                          disabled={!paymentSettings.umsPayEnabled}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-gray-600">UMS Pay Account ID</label>
                        <input
                          type="text"
                          value={paymentSettings.umsPayAccountId}
                          onChange={(e) =>
                            setPaymentSettings({ ...paymentSettings, umsPayAccountId: e.target.value })
                          }
                          placeholder="Enter UMS Pay Account ID"
                          className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent transition-colors"
                          disabled={!paymentSettings.umsPayEnabled}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Find your API key and Account ID in the{" "}
                        <a
                          href="https://umspay.co.ke/dashboard"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#03a678] hover:underline"
                        >
                          UMS Pay Dashboard
                        </a>.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* UMSComms Settings */}
              <div className="border rounded-lg p-4 hover:shadow-md transition-shadow duration-200">
                <div
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => toggleGateway("umsComms")}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-700">UMSComms (SMS)</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                        paymentSettings.umsCommsEnabled ? "bg-[#03a678]" : "bg-gray-300"
                      }`}
                      onClick={(e) => {
                        e.stopPropagation();
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
                          className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent transition-colors"
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
                          className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent transition-colors"
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
                          className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-[#03a678] focus:border-transparent transition-colors"
                          disabled={!paymentSettings.umsCommsEnabled}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Find your API key and App ID in the{" "}
                        <a
                          href="https://comms.umeskiasoftwares.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#03a678] hover:underline"
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
              className="mt-6 bg-[#03a678] hover:bg-[#02956a] text-white px-5 py-2 rounded-lg flex items-center gap-2 transition-colors duration-200 disabled:opacity-50"
              disabled={paymentLoading}
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