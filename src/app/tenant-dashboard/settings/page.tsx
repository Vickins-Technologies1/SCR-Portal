"use client";

import React, { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { Save, User, Lock } from "lucide-react";

interface Tenant {
  name: string;
  email: string;
  phone: string;
}

export default function SettingsPage() {
  const [tenant, setTenant] = useState<Tenant>({ name: "", email: "", phone: "" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const tenantId = Cookies.get("userId");

  useEffect(() => {
    const fetchTenant = async () => {
      try {
        const res = await fetch(`/api/tenant/profile?tenantId=${tenantId}`);
        const data = await res.json();
        if (data.success) {
          setTenant(data.tenant);
        }
      } catch (error) {
        console.error("Failed to fetch profile:", error);
      }
    };
    if (tenantId) fetchTenant();
  }, [tenantId]);

  const handleProfileUpdate = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, ...tenant }),
      });
      const data = await res.json();
      if (!data.success) alert("Update failed");
    } catch (error) {
      console.error("Update error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (!password || password !== confirmPassword) {
      alert("Passwords must match and not be empty.");
      return;
    }

    try {
      const res = await fetch("/api/tenant/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, password }),
      });
      const data = await res.json();
      if (!data.success) {
        alert("Password change failed.");
      } else {
        alert("Password changed successfully.");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      console.error("Password change error:", err);
    }
  };

  return (
    <div className="space-y-6">
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
          disabled={loading}
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
          <div>
            <label className="block text-sm font-medium">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded"
            />
          </div>
          <div>
            <label className="block text-sm font-medium">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 w-full px-3 py-2 border rounded"
            />
          </div>
        </div>

        <button
          onClick={handlePasswordChange}
          className="bg-[#012a4a] text-white px-4 py-2 rounded hover:bg-[#011d34]"
        >
          Change Password
        </button>
      </div>
    </div>
  );
}
