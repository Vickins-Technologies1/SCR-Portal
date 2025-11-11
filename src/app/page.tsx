"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  FaEye,
  FaEyeSlash,
  FaGoogle,
  FaArrowRight,
} from "react-icons/fa";
import Cookies from "js-cookie";
import { motion } from "framer-motion";
import Link from "next/link";

export default function LoginPage() {
  const [isTenantPortal, setIsTenantPortal] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  // Auto-fill & auto-submit for demo mode
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get("demo");

    if (demo === "owner") {
      setEmail("demo@admin.com");
      setPassword("Demo@2025!");
      setIsTenantPortal(false);
      setTimeout(() => submitForm(), 300);
    } else if (demo === "tenant") {
      setEmail("tenant@demo.com");
      setPassword("Tenant@2025!");
      setIsTenantPortal(true);
      setTimeout(() => submitForm(), 300);
    }
  }, []);

  const submitForm = () => {
    const form = document.getElementById("login-form") as HTMLFormElement;
    form?.requestSubmit();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const payload = {
      email,
      password,
      role: isTenantPortal ? "tenant" : "propertyOwner",
    };

    try {
      const res = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Login failed");

      Cookies.set("userId", data.userId, { secure: true, sameSite: "Strict", expires: 7 });
      Cookies.set("role", data.role, { secure: true, sameSite: "Strict", expires: 7 });

      router.push(data.redirect || "/dashboard");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-gray-50 to-blue-50">
      {/* LEFT: Branding */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-blue-900 to-teal-600 text-white items-center justify-center p-8 relative overflow-hidden">
        <div className="text-center space-y-6 z-10">
          <Image
            src="/logo.png"
            alt="Logo"
            width={120}
            height={120}
            className="mx-auto drop-shadow-xl"
          />
          <h2 className="text-4xl font-black tracking-tight">
            Smart Choice Rentals
          </h2>
          <p className="text-lg opacity-90">Instant access. Zero hassle. Real results.</p>
          <a
            href="https://smartchoicerentalmanagement.com"
            className="inline-flex items-center gap-2 bg-white/20 backdrop-blur px-5 py-2.5 rounded-full hover:bg-white/30 transition text-sm"
          >
            Visit Homepage <FaArrowRight className="text-xs" />
          </a>
        </div>
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="70" fill="none" stroke="white" strokeWidth="2" />
            <circle cx="60" cy="60" r="18" fill="white" opacity="0.3" />
            <circle cx="140" cy="140" r="22" fill="white" opacity="0.3" />
          </svg>
        </div>
      </div>

      {/* RIGHT: Login Form */}
      <div className="flex flex-col w-full lg:w-1/2 items-center justify-center p-5 lg:p-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-blue-100 p-6 space-y-5"
        >
          {/* Mobile Logo */}
          <div className="flex justify-center lg:hidden mb-2">
            <Image src="/logo.png" alt="Logo" width={70} height={70} />
          </div>

          <div className="text-center">
            <h1 className="text-2xl font-bold text-blue-900">
              {isTenantPortal ? "Tenant Portal" : "Property Owner"} Login
            </h1>
            <p className="text-sm text-gray-600 mt-1">Enter your credentials to continue</p>
          </div>

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-2 bg-red-50 text-red-700 text-xs rounded-lg text-center border border-red-200"
            >
              {error}
            </motion.p>
          )}

          {/* Portal Switch */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsTenantPortal(!isTenantPortal)}
              className="text-teal-600 font-medium text-xs hover:underline"
            >
              {isTenantPortal ? "Switch to Owner Login" : "Switch to Tenant Portal"}
            </button>
          </div>

          {/* Google Login */}
          <button
            type="button"
            onClick={() => (window.location.href = "/api/auth/google")}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 border border-blue-200 text-blue-900 font-medium py-2.5 rounded-xl hover:bg-blue-50 transition text-sm"
          >
            <FaGoogle /> Continue with Google
          </button>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <hr className="flex-1 border-gray-300" />
            <span>or</span>
            <hr className="flex-1 border-gray-300" />
          </div>

          <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition text-sm"
            />

            {/* Password */}
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-2.5 pr-10 border border-blue-200 rounded-lg focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition text-sm"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-teal-600"
              >
                {showPassword ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
              </button>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-teal-500 text-white font-semibold py-2.5 rounded-xl hover:from-blue-700 hover:to-teal-600 transform hover:scale-[1.02] transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isLoading ? "Logging in…" : isTenantPortal ? "Tenant Login" : "Owner Login"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-600">
            New here?{" "}
            <Link href="/sign-up" className="text-teal-600 font-medium hover:underline">
              Sign Up Free
            </Link>
          </p>

          {/* Demo Buttons (Optional – keep if needed) */}
          <div className="pt-4 border-t border-gray-200 space-y-2">
            <p className="text-center text-xs font-medium text-gray-500">Try Demo</p>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="/login?demo=owner"
                className="block text-center bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-xs font-medium"
              >
                Owner Demo
              </a>
              <a
                href="/login?demo=tenant"
                className="block text-center bg-teal-600 text-white py-2 rounded-lg hover:bg-teal-700 transition text-xs font-medium"
              >
                Tenant Demo
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}