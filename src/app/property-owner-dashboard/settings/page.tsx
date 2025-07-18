"use client";

import { useEffect, useState } from "react";
import Cookies from "js-cookie";
import { Save, User, Lock, Settings } from "lucide-react";
import Sidebar from "../components/Sidebar";
import Navbar from "../components/Navbar";

export default function OwnerSettingsPage() {
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [profile, setProfile] = useState({ name: "", email: "", phone: "" });
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const id = Cookies.get("userId");
    const role = Cookies.get("role");
    if (!id || role !== "propertyOwner") return;
    setOwnerId(id);

    const fetchProfile = async () => {
      const res = await fetch(`/api/owner/profile?ownerId=${id}`);
      const data = await res.json();
      if (data.success) setProfile(data.owner);
    };
    fetchProfile();
  }, []);

  const updateProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, ...profile }),
      });
      const data = await res.json();
      if (!data.success) alert("Failed to update profile.");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async () => {
    if (!password || password !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }
    try {
      const res = await fetch("/api/owner/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId, password }),
      });
      const data = await res.json();
      if (data.success) {
        alert("Password updated.");
        setPassword("");
        setConfirmPassword("");
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white font-sans">
      <Navbar />
      <Sidebar />
      <div className="sm:ml-64 mt-16">
        <main className="px-6 sm:px-8 lg:px-12 py-8 bg-gray-50 min-h-screen overflow-y-auto transition-all duration-300">
          {/* Header */}
          <h1 className="text-3xl font-semibold text-gray-800 mb-8 flex items-center gap-2 animate-fade-in">
            <Settings size={28} className="text-[#03a678]" />
            Settings
          </h1>

          {/* Profile Card */}
          <div className="bg-white rounded-xl shadow-sm border p-6 mb-8 animate-fade-in-up">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800">
              <User className="text-[#012a4a]" />
              Profile Information
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-gray-600">Full Name</label>
                <input
                  type="text"
                  value={profile.name}
                  onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                  className="mt-1 w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Email</label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                  className="mt-1 w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Phone</label>
                <input
                  type="tel"
                  value={profile.phone}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                  className="mt-1 w-full px-4 py-2 border rounded-lg"
                />
              </div>
            </div>
            <button
              onClick={updateProfile}
              className="mt-6 bg-[#03a678] hover:bg-[#02956a] text-white px-5 py-2 rounded flex items-center gap-2"
              disabled={loading}
            >
              <Save size={16} />
              {loading ? "Saving..." : "Save Changes"}
            </button>
          </div>

          {/* Password Card */}
          <div className="bg-white rounded-xl shadow-sm border p-6 animate-fade-in-up">
            <h2 className="text-lg font-bold mb-4 flex items-center gap-2 text-gray-800">
              <Lock className="text-[#012a4a]" />
              Change Password
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <label className="text-sm font-medium text-gray-600">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border rounded-lg"
                />
              </div>
            </div>
            <button
              onClick={changePassword}
              className="mt-6 bg-[#012a4a] hover:bg-[#011d34] text-white px-5 py-2 rounded"
            >
              Change Password
            </button>
          </div>
        </main>
      </div>

      {/* Global animations */}
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        body {
          font-family: 'Inter', sans-serif;
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out;
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.4s ease-out;
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
