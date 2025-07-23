"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Cookies from "js-cookie";

interface LoginResponse {
  success: boolean;
  user?: { _id: string; role: string };
  message?: string;
}

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<{ email?: string; password?: string }>({});

  // Redirect if already logged in
  useEffect(() => {
    const userId = Cookies.get("userId");
    const role = Cookies.get("role");
    if (userId && role === "admin") {
      router.push("/admin/dashboard");
    }
  }, [router]);

  const validateForm = () => {
    const errors: { email?: string; password?: string } = {};
    if (!email.trim()) {
      errors.email = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.email = "Invalid email format";
    }
    if (!password.trim()) {
      errors.password = "Password is required";
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password, role: "admin" }),
      });
      const data: LoginResponse = await response.json();
      if (data.success && data.user) {
        Cookies.set("userId", data.user._id, { expires: 7 });
        Cookies.set("role", data.user.role, { expires: 7 });
        router.push("/admin/dashboard");
      } else {
        setError(data.message || "Invalid email or password");
      }
    } catch {
      setError("Failed to connect to the server. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-white font-sans">
      <div className="bg-white p-6 sm:p-8 rounded-lg shadow-lg w-full max-w-md">
        <div className="flex justify-center mb-6">
          <Image src="/logo.png" alt="Logo" width={56} height={56} className="object-contain" />
        </div>
        <h2 className="text-2xl font-bold text-center text-[#012a4a] mb-6">Admin Login</h2>
        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setFormErrors((prev) => ({
                  ...prev,
                  email: e.target.value.trim()
                    ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.target.value)
                      ? undefined
                      : "Invalid email format"
                    : "Email is required",
                }));
              }}
              placeholder="Enter your email"
              className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm ${
                formErrors.email ? "border-red-500" : "border-gray-300"
              }`}
            />
            {formErrors.email && <p className="text-red-500 text-xs mt-1">{formErrors.email}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setFormErrors((prev) => ({
                  ...prev,
                  password: e.target.value.trim() ? undefined : "Password is required",
                }));
              }}
              placeholder="Enter your password"
              className={`w-full border px-3 py-2 rounded-lg focus:ring-2 focus:ring-[#012a4a] focus:border-[#012a4a] transition text-sm ${
                formErrors.password ? "border-red-500" : "border-gray-300"
              }`}
            />
            {formErrors.password && <p className="text-red-500 text-xs mt-1">{formErrors.password}</p>}
          </div>
          <button
            type="submit"
            disabled={isLoading || Object.values(formErrors).some((v) => v !== undefined)}
            className={`w-full py-2 text-white rounded-lg transition flex items-center justify-center text-sm ${
              isLoading || Object.values(formErrors).some((v) => v !== undefined)
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-[#012a4a] hover:bg-[#014a7a]"
            }`}
          >
            {isLoading && (
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white mr-2"></div>
            )}
            Login
          </button>
        </form>
      </div>
    </div>
  );
}