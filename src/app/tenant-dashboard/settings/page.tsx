"use client";

import React, { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { Save, User, Lock, Eye, EyeOff, X, CheckCircle, AlertCircle } from "lucide-react";

interface Tenant {
  name: string;
  email: string;
  phone: string;
}

interface Notification {
  id: string;
  type: "success" | "error";
  message: string;
}

export default function SettingsPage() {
  const [tenant, setTenant] = useState<Tenant>({ name: "", email: "", phone: "" });
  const [original, setOriginal] = useState<Tenant>({ name: "", email: "", phone: "" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const tenantId = Cookies.get("userId");

  const notify = (type: "success" | "error", msg: string) => {
    const id = Date.now().toString();
    setNotifications((prev) => [...prev, { id, type, message: msg }]);
    setTimeout(() => setNotifications((prev) => prev.filter((n) => n.id !== id)), 4000);
  };

  useEffect(() => {
    const getCsrf = async () => {
      try {
        const res = await fetch("/api/csrf-token", { credentials: "include" });
        const data = await res.json();
        if (data.success) setCsrfToken(data.csrfToken);
      } catch {
        notify("error", "Connection failed");
      }
    };
    getCsrf();
  }, []);

  useEffect(() => {
    if (!tenantId || !csrfToken) return;

    const loadProfile = async () => {
      try {
        const res = await fetch("/api/tenant/profile", {
          headers: { "x-csrf-token": csrfToken },
          credentials: "include",
        });
        const data = await res.json();
        if (data.success && data.tenant) {
          const { name, email, phone } = data.tenant;
          setTenant({ name, email, phone });
          setOriginal({ name, email, phone });
        }
      } catch {
        notify("error", "Failed to load profile");
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [tenantId, csrfToken]);

  const hasChanges = () =>
    tenant.name !== original.name ||
    tenant.email !== original.email ||
    tenant.phone !== original.phone;

  const saveProfile = async () => {
    if (!csrfToken) return;
    setSaving(true);
    try {
      const res = await fetch("/api/tenant/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken },
        credentials: "include",
        body: JSON.stringify({ tenantId, ...tenant }),
      });
      const data = await res.json();
      if (data.success) {
        setOriginal(tenant);
        notify("success", "Profile updated");
      } else notify("error", data.message || "Update failed");
    } catch {
      notify("error", "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (password !== confirmPassword || password.length < 6) {
      notify("error", "Passwords must match and be 6+ characters");
      return;
    }
    setChanging(true);
    try {
      const res = await fetch("/api/tenant/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrfToken! },
        credentials: "include",
        body: JSON.stringify({ tenantId, password }),
      });
      const data = await res.json();
      if (data.success) {
        notify("success", "Password changed");
        setPassword("");
        setConfirmPassword("");
      } else notify("error", data.message || "Failed");
    } catch {
      notify("error", "Password change failed");
    } finally {
      setChanging(false);
    }
  };

  // Modern Fading Box Loader
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pt-16 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* Header */}
          <div className="h-32 bg-gradient-to-r from-gray-300 to-gray-400 rounded-2xl animate-pulse" />
          {/* Profile Card */}
          <div className="bg-white rounded-2xl p-6 space-y-6 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-200 rounded-xl" />
              <div className="h-7 bg-gray-200 rounded w-48" />
            </div>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i}>
                  <div className="h-4 bg-gray-200 rounded w-24 mb-2" />
                  <div className="h-12 bg-gray-100 rounded-xl" />
                </div>
              ))}
            </div>
            <div className="h-12 bg-gray-200 rounded-xl w-36 ml-auto" />
          </div>
          {/* Password Card */}
          <div className="bg-white rounded-2xl p-6 space-y-6 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-100 rounded-xl" />
              <div className="h-7 bg-gray-200 rounded w-56" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {[1, 2].map((i) => (
                <div key={i}>
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2" />
                  <div className="h-12 bg-gray-100 rounded-xl relative overflow-hidden">
                    <div className="absolute right-3 top-3 w-10 h-6 bg-gray-200 rounded" />
                  </div>
                </div>
              ))}
            </div>
            <div className="h-12 bg-red-200 rounded-xl w-44 ml-auto" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Toast Notifications */}
      <div className="fixed top-20 right-4 z-50 space-y-3">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`flex items-center gap-3 p-4 rounded-xl shadow-xl border text-sm font-medium animate-in slide-in-from-right ${
              n.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {n.type === "success" ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span>{n.message}</span>
            <button onClick={() => setNotifications(prev => prev.filter(x => x.id !== n.id))}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="min-h-screen bg-gray-50 pt-16 px-4 pb-10">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Header */}
          <div className="bg-gradient-to-r from-[#1E3A8A] to-[#1E40AF] text-white rounded-2xl p-6 text-center">
            <h1 className="text-2xl font-bold">Account Settings</h1>
            <p className="text-blue-100 text-sm mt-1">Update your profile & password</p>
          </div>

          {/* Profile Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-[#6EE7B7]/20 rounded-xl">
                <User className="w-5 h-5 text-[#1E3A8A]" />
              </div>
              <h2 className="text-xl font-bold">Profile Information</h2>
            </div>

            <div className="space-y-4">
              <input
                type="text"
                placeholder="Full Name"
                value={tenant.name}
                onChange={(e) => setTenant({ ...tenant, name: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-4 focus:ring-[#6EE7B7]/30 focus:border-[#1E3A8A] transition"
              />
              <input
                type="email"
                placeholder="Email"
                value={tenant.email}
                onChange={(e) => setTenant({ ...tenant, email: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-4 focus:ring-[#6EE7B7]/30 focus:border-[#1E3A8A] transition"
              />
              <input
                type="tel"
                placeholder="Phone (+254...)"
                value={tenant.phone}
                onChange={(e) => setTenant({ ...tenant, phone: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-4 focus:ring-[#6EE7B7]/30 focus:border-[#1E3A8A] transition"
              />
            </div>

            <button
              onClick={saveProfile}
              disabled={saving || !hasChanges()}
              className="w-full sm:w-auto px-8 py-3 bg-[#1E3A8A] text-white font-bold rounded-xl hover:bg-[#1E40AF] disabled:bg-gray-300 transition flex items-center justify-center gap-2"
            >
              <Save size={18} />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>

          {/* Password Card */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 space-y-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-red-100 rounded-xl">
                <Lock className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-xl font-bold">Change Password</h2>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  placeholder="New Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-300 focus:ring-4 focus:ring-red-500/20 focus:border-red-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-3.5 text-gray-500"
                >
                  {showPass ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>

              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-300 focus:ring-4 focus:ring-red-500/20 focus:border-red-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-3.5 text-gray-500"
                >
                  {showConfirm ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            <button
              onClick={changePassword}
              disabled={changing || !password || password !== confirmPassword}
              className="w-full sm:w-auto px-8 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 disabled:bg-gray-300 transition"
            >
              {changing ? "Changing..." : "Change Password"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}