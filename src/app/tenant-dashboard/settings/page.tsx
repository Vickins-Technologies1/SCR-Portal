"use client";

import React, { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { Save, User, Lock, Eye, EyeOff, X, CheckCircle } from "lucide-react";

interface Tenant {
  name: string;
  email: string;
  phone: string;
}

interface Notification {
  id: string;
  type: "success" | "error";
  message: string;
  autoDismiss: boolean;
}

export default function SettingsPage() {
  const [tenant, setTenant] = useState<Tenant>({ name: "", email: "", phone: "" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const tenantId = Cookies.get("userId");

  const addNotification = (type: "success" | "error", message: string, autoDismiss = true) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications((prev) => [...prev, { id, type, message, autoDismiss }]);
  };

  const removeNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const res = await fetch("/api/csrf-token", {
          method: "GET",
          credentials: "include",
        });
        const data = await res.json();
        if (data.success) {
          setCsrfToken(data.csrfToken);
        } else {
          addNotification("error", data.message || "Failed to fetch CSRF token", false);
        }
      } catch (err) {
        console.error("Error fetching CSRF token:", err);
        addNotification("error", "Failed to fetch CSRF token", false);
      }
    };

    const fetchTenant = async () => {
      if (!tenantId || !csrfToken) return;
      try {
        const res = await fetch(`/api/tenant/profile?tenantId=${tenantId}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "x-csrf-token": csrfToken,
          },
          credentials: "include",
        });
        const data = await res.json();
        if (data.success) {
          setTenant(data.tenant);
        } else {
          addNotification("error", data.message || "Failed to fetch profile", false);
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
        addNotification("error", "Failed to fetch profile", false);
      }
    };

    fetchCsrfToken();
    if (tenantId && csrfToken) fetchTenant();
  }, [tenantId, csrfToken]);

  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    notifications.forEach((n) => {
      if (n.autoDismiss) {
        const timer = setTimeout(() => removeNotification(n.id), 3000);
        timers.push(timer);
      }
    });
    return () => timers.forEach(clearTimeout);
  }, [notifications]);

  const handleProfileUpdate = async () => {
    if (!csrfToken) {
      addNotification("error", "CSRF token not available. Please refresh the page.", false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/tenant/profile", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ tenantId, ...tenant }),
      });
      const data = await res.json();
      if (!data.success) {
        addNotification("error", data.message || "Profile update failed", false);
      } else {
        addNotification("success", "Profile updated successfully");
      }
    } catch (error) {
      console.error("Update error:", error);
      addNotification("error", "Failed to update profile", false);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!password || password !== confirmPassword) {
      addNotification("error", "Passwords must match and not be empty.", false);
      return;
    }

    if (!csrfToken) {
      addNotification("error", "CSRF token not available. Please refresh the page.", false);
      return;
    }

    try {
      const res = await fetch("/api/tenant/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrfToken,
        },
        credentials: "include",
        body: JSON.stringify({ tenantId, password }),
      });
      const data = await res.json();
      if (!data.success) {
        addNotification("error", data.message || "Password change failed.", false);
      } else {
        addNotification("success", "Password changed successfully");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      console.error("Password change error:", err);
      addNotification("error", "Failed to change password", false);
    }
  };

  const toggleShowPassword = () => setShowPassword(!showPassword);
  const toggleShowConfirmPassword = () => setShowConfirmPassword(!showConfirmPassword);

  return (
    <div className="space-y-6">
      {/* Notifications */}
      <div className="fixed top-4 right-4 space-y-2 z-50">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={`flex items-center gap-2 p-4 rounded-lg shadow-lg animate-slide-in ${
              n.type === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
            }`}
          >
            {n.type === "success" ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.732 6.732a1 1 0 011.414 0L10 7.586l.854-.854a1 1 0 111.414 1.414L11.414 9l.854.854a1 1 0 11-1.414 1.414L10 10.414l-.854.854a1 1 0 01-1.414-1.414L8.586 9l-.854-.854a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span className="flex-1">{n.message}</span>
            <button
              onClick={() => removeNotification(n.id)}
              className="text-current hover:text-gray-900"
              aria-label="Close notification"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <section className="mb-6 bg-blue-900 text-white rounded-xl p-6 shadow-lg">
        <h1 className="text-2xl font-semibold mb-1">Account Settings</h1>
        <p>Update your profile information and credentials.</p>
      </section>

      {/* Profile Section */}
      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <User className="text-[#03a678]" /> Profile Information
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium">Full Name</label>
            <input
              type="text"
              value={tenant.name}
              onChange={(e) => setTenant({ ...tenant, name: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Email</label>
            <input
              type="email"
              value={tenant.email}
              onChange={(e) => setTenant({ ...tenant, email: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Phone</label>
            <input
              type="tel"
              value={tenant.phone}
              onChange={(e) => setTenant({ ...tenant, phone: e.target.value })}
              className="mt-1 w-full px-3 py-2 border rounded"
            />
          </div>
        </div>

        <button
          onClick={handleProfileUpdate}
          className="bg-[#03a678] text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-[#02956a]"
          disabled={loading || !csrfToken}
        >
          <Save size={16} />
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {/* Password Section */}
      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Lock className="text-[#03a678]" /> Change Password
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="relative">
            <label className="block text-sm font-medium">New Password</label>
            <input
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full px-3 py-2 pr-10 border rounded"
            />
            <button
              type="button"
              onClick={toggleShowPassword}
              className="absolute right-3 top-1/2 transform translate-y-1 mt-1 text-gray-500 hover:text-gray-700"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
          <div className="relative">
            <label className="block text-sm font-medium">Confirm Password</label>
            <input
              type={showConfirmPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full px-3 py-2 pr-10 border rounded"
            />
            <button
              type="button"
              onClick={toggleShowConfirmPassword}
              className="absolute right-3 top-1/2 transform translate-y-1 mt-1 text-gray-500 hover:text-gray-700"
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}
            >
              {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          </div>
        </div>

        <button
          onClick={handlePasswordChange}
          className="bg-[#012a4a] text-white px-4 py-2 rounded hover:bg-[#011d34]"
          disabled={!csrfToken}
        >
          Change Password
        </button>
      </div>

      <style jsx>{`
        @keyframes slide-in {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        .animate-slide-in {
          animation: slide-in 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}