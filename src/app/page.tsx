"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaGoogle, FaArrowRight } from "react-icons/fa";
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get("demo");

    if (demo === "owner") {
      setEmail("demo@admin.com");
      setPassword("Demo@2025!");
      setIsTenantPortal(false);
      setTimeout(() => submitForm(), 400);
    } else if (demo === "tenant") {
      setEmail("tenant@demo.com");
      setPassword("Tenant@2025!");
      setIsTenantPortal(true);
      setTimeout(() => submitForm(), 400);
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
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-blue-50/30">

      {/* LEFT: Branding – hidden on mobile, appears from lg+ */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-950 via-blue-950 to-teal-950 text-white items-center justify-center p-8 xl:p-12 relative overflow-hidden">
        {/* Animated bubbles – reduced scale & movement for performance */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div
            className="absolute w-64 h-64 rounded-full bg-gradient-to-br from-teal-400/20 to-cyan-300/10 blur-3xl"
            initial={{ x: "-10%", y: "50%", scale: 1 }}
            animate={{
              x: ["-10%", "20%", "-5%"],
              y: ["50%", "10%", "60%"],
              scale: [1, 1.1, 1],
            }}
            transition={{ duration: 20, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
          <motion.div
            className="absolute w-80 h-80 rounded-full bg-gradient-to-br from-cyan-300/12 to-teal-200/6 blur-2xl"
            initial={{ x: "60%", y: "-20%", scale: 0.95 }}
            animate={{
              x: ["60%", "35%", "70%"],
              y: ["-20%", "15%", "-35%"],
              scale: [0.95, 1.05, 0.95],
            }}
            transition={{ duration: 24, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 5 }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-indigo-950/20" />
        </div>

        <div className="text-center space-y-6 xl:space-y-8 z-10 max-w-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="bg-white/90 backdrop-blur-md rounded-2xl p-5 shadow-xl border border-white/25 inline-block"
          >
            <Image
              src="/logo.png"
              alt="Sorana Logo"
              width={300}
              height={110}
              className="mx-auto drop-shadow-xl"
              priority
            />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.7 }}
            className="text-4xl xl:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-teal-200 via-cyan-100 to-blue-200"
          >
            Sorana Property Managers
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.7 }}
            className="text-lg xl:text-xl font-light opacity-90"
          >
           Real-time portfolio analytics & ROI tracking for modern property owners.
          </motion.p>

          <motion.a
            href="https://smartchoicerentalmanagement.com"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="inline-flex items-center gap-2 text-sm font-medium bg-white/10 backdrop-blur-md border border-white/20 px-5 py-2.5 rounded-full hover:bg-white/15 transition-all"
            whileHover={{ scale: 1.04 }}
          >
            Visit Homepage <FaArrowRight className="text-sm" />
          </motion.a>
        </div>
      </div>

      {/* RIGHT: Login Form – compact & premium */}
      <div className="flex-1 flex items-center justify-center min-h-screen lg:min-h-0 p-5 sm:p-8 md:p-10 lg:p-12 bg-white/40 lg:bg-gradient-to-b lg:from-transparent lg:to-white/30">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-[420px] bg-white/75 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-xl border border-white/30 overflow-hidden"
        >
          {/* Mobile-only logo – smaller */}
          <div className="flex justify-center lg:hidden pt-7 pb-4">
            <Image src="/logo.png" alt="Sorana" width={100} height={40} className="drop-shadow-md" />
          </div>

          <div className="px-6 sm:px-8 pt-6 sm:pt-8 pb-8 sm:pb-10 space-y-5 sm:space-y-6">
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-800 to-teal-700 bg-clip-text text-transparent">
                {isTenantPortal ? "Tenant Portal" : "Owner Dashboard"}
              </h1>
              <p className="text-gray-600 mt-1.5 text-sm sm:text-base font-medium">
                Secure access • Anytime
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-3 bg-red-50/80 backdrop-blur-sm text-red-700 text-sm rounded-xl border border-red-200/60 text-center"
              >
                {error}
              </motion.div>
            )}

            {/* Portal switch – more compact */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => setIsTenantPortal(!isTenantPortal)}
                className="text-teal-600 text-sm font-semibold hover:text-teal-700 transition-colors px-4 py-1.5 rounded-full hover:bg-teal-50/60"
              >
                {isTenantPortal ? "Switch to Owner" : "Switch to Tenant"}
              </button>
            </div>

            {/* Google button – slimmer */}
            <motion.button
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              type="button"
              onClick={() => (window.location.href = "/api/auth/google")}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2.5 border border-slate-200 bg-white/85 backdrop-blur-sm text-slate-800 font-medium py-3 rounded-xl hover:bg-slate-50 transition-all shadow-sm disabled:opacity-60 text-sm sm:text-base"
            >
              <FaGoogle className="text-red-500 text-base" /> Continue with Google
            </motion.button>

            <div className="flex items-center gap-3 text-xs text-gray-400">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
              <span className="font-medium">or</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
            </div>

            <form id="login-form" onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/65 backdrop-blur-sm border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/30 transition-all text-sm sm:text-base placeholder:text-gray-500 shadow-inner"
              />

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 pr-11 bg-white/65 backdrop-blur-sm border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/30 transition-all text-sm sm:text-base placeholder:text-gray-500 shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-teal-600 transition-colors"
                >
                  {showPassword ? <FaEyeSlash size={17} /> : <FaEye size={17} />}
                </button>
              </div>

              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-blue-600 via-teal-500 to-teal-600 text-white font-semibold py-3 rounded-xl hover:brightness-110 hover:shadow-lg transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed shadow-md text-sm sm:text-base tracking-wide"
              >
                {isLoading
                  ? "Authenticating…"
                  : isTenantPortal
                  ? "Enter Tenant Portal"
                  : "Access Dashboard"}
              </motion.button>
            </form>

            <p className="text-center text-sm text-gray-600 pt-1">
              New here?{" "}
              <Link
                href="/sign-up"
                className="text-teal-600 font-semibold hover:text-teal-700 hover:underline transition-colors"
              >
                Create account
              </Link>
            </p>
          </div>

          {/* Demo section – more compact */}
          <div className="px-6 sm:px-8 pb-7 pt-4 border-t border-slate-100 bg-slate-50/50">
            <p className="text-center text-xs text-gray-500 font-medium mb-3">Quick Demo</p>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <a
                href="/?demo=owner"
                className="block text-center bg-gradient-to-r from-blue-600 to-blue-700 text-white py-2.5 sm:py-3 rounded-xl hover:brightness-110 transition-all text-sm font-semibold shadow-sm"
              >
                Owner Demo
              </a>
              <a
                href="/?demo=tenant"
                className="block text-center bg-gradient-to-r from-teal-600 to-teal-700 text-white py-2.5 sm:py-3 rounded-xl hover:brightness-110 transition-all text-sm font-semibold shadow-sm"
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