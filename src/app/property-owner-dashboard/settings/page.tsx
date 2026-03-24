"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { Save, User, Lock, CreditCard, Settings } from "lucide-react";
import { motion } from "framer-motion";
import toast, { Toaster } from "react-hot-toast"; // Import react-hot-toast
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";
import { usePermissions } from "@/hooks/usePermissions";
import ConnectMpesaForm from "@/components/ConnectMpesaForm";

export default function OwnerSettingsPage() {
  const router = useRouter();
  const perm = usePermissions();
  const canViewSettings = perm.hasPermission("settings:view");
  const sessionRole = Cookies.get("role") || null;
  const isOwnerRole = sessionRole === "propertyOwner";
  const canEditSettings = isOwnerRole || perm.hasPermission("settings:edit");
  const isReadOnly = !canEditSettings;
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

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
              Payments
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mb-4">
              M-Pesa credentials are managed at the platform level. Please add your payout details below.
            </p>
            <ConnectMpesaForm disabled={isReadOnly} />
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







