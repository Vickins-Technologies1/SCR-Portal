"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaGoogle, FaArrowRight } from "react-icons/fa";
import Cookies from "js-cookie";
import { motion } from "framer-motion";
import Link from "next/link";

export default function TenantLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get("demo");

    if (demo === "tenant") {
      setEmail("tenant@demo.com");
      setPassword("Tenant@2025!");
      setTimeout(() => submitForm(), 400);
    }
  }, []);

  const submitForm = () => {
    const form = document.getElementById("tenant-login-form") as HTMLFormElement;
    form?.requestSubmit();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const payload = { email, password, role: "tenant" };

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
      {/* LEFT: Branding – hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-950 via-blue-950 to-teal-950 text-white items-center justify-center p-6 xl:p-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div
            className="absolute w-64 h-64 rounded-full bg-gradient-to-br from-teal-400/20 to-cyan-300/10 blur-3xl"
            initial={{ x: "-10%", y: "50%", scale: 1 }}
            animate={{ x: ["-10%", "20%", "-5%"], y: ["50%", "10%", "60%"], scale: [1, 1.1, 1] }}
            transition={{ duration: 20, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
          <motion.div
            className="absolute w-80 h-80 rounded-full bg-gradient-to-br from-cyan-300/12 to-teal-200/6 blur-2xl"
            initial={{ x: "60%", y: "-20%", scale: 0.95 }}
            animate={{ x: ["60%", "35%", "70%"], y: ["-20%", "15%", "-35%"], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 24, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 5 }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-indigo-950/20" />
        </div>

        <div className="text-center space-y-6 xl:space-y-9 z-10 max-w-lg">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="bg-white/90 backdrop-blur-md rounded-2xl p-5 sm:p-6 shadow-2xl border border-white/25 inline-block"
          >
            <Image
              src="/logo.png"
              alt="Sorana"
              width={300}
              height={110}
              className="mx-auto drop-shadow-2xl max-w-[260px] sm:max-w-[300px]"
              priority
            />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.8 }}
            className="text-4xl sm:text-5xl xl:text-6xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-teal-300 via-cyan-200 to-blue-200"
          >
            Your Home Portal
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.8 }}
            className="text-lg sm:text-xl xl:text-2xl font-light opacity-90 leading-relaxed px-2 sm:px-0"
          >
            Pay rent effortlessly • Submit maintenance requests •  
            Stay connected with your property manager — anytime, anywhere.
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.65, duration: 0.8 }}
            className="text-base sm:text-lg font-medium text-teal-200/90 tracking-wide"
          >
            Living made simple. Peace of mind included.
          </motion.p>

          <motion.a
            href="https://soranapropertymanagers.com"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8 }}
            className="inline-flex items-center gap-2.5 text-sm sm:text-base font-semibold bg-white/12 backdrop-blur-lg border border-white/30 px-6 py-3 rounded-full hover:bg-white/20 transition-all shadow-md"
            whileHover={{ scale: 1.05, boxShadow: "0 10px 30px -10px rgba(45, 212, 191, 0.4)" }}
          >
            Discover Sorana <FaArrowRight className="text-base sm:text-lg" />
          </motion.a>
        </div>
      </div>

      {/* RIGHT: Form – responsive */}
      <div className="flex-1 flex items-center justify-center min-h-screen lg:min-h-0 px-5 py-8 sm:px-8 md:px-10 lg:p-12 bg-white/40 lg:bg-gradient-to-b lg:from-transparent lg:to-white/30">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="w-full max-w-md sm:max-w-lg bg-white/75 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-xl border border-white/30 overflow-hidden"
        >
          <div className="flex justify-center lg:hidden pt-6 pb-4">
            <Image src="/logo.png" alt="Sorana" width={100} height={40} className="drop-shadow-md max-w-[200px] w-full" />
          </div>

          <div className="px-5 sm:px-8 pt-5 sm:pt-8 pb-8 sm:pb-10 space-y-5 sm:space-y-6">
            <div className="text-center">
              <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-blue-800 to-teal-700 bg-clip-text text-transparent">
                Tenant Portal
              </h1>
              <p className="text-gray-600 mt-2 text-sm sm:text-base font-medium">
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

            <motion.button
              whileHover={{ scale: 1.015 }}
              whileTap={{ scale: 0.985 }}
              type="button"
              onClick={() => (window.location.href = "/api/auth/google?role=tenant")}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2.5 border border-slate-200 bg-white/85 backdrop-blur-sm text-slate-800 font-medium py-3.5 rounded-xl hover:bg-slate-50 transition-all shadow-sm disabled:opacity-60 text-sm sm:text-base min-h-[48px]"
            >
              <FaGoogle className="text-red-500 text-base" /> Continue with Google
            </motion.button>

            <div className="flex items-center gap-3 text-xs sm:text-sm text-gray-400 my-2">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
              <span className="font-medium">or</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-300 to-transparent" />
            </div>

            <form id="tenant-login-form" onSubmit={handleSubmit} className="space-y-4">
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3.5 text-sm sm:text-base bg-white/65 backdrop-blur-sm border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/30 transition-all placeholder:text-gray-500 shadow-inner min-h-[48px]"
              />

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3.5 pr-11 text-sm sm:text-base bg-white/65 backdrop-blur-sm border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/30 transition-all placeholder:text-gray-500 shadow-inner min-h-[48px]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-teal-600 transition-colors p-1"
                >
                  {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
              </div>

              <motion.button
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-blue-600 via-teal-500 to-teal-600 text-white font-semibold py-3.5 rounded-xl hover:brightness-110 hover:shadow-lg transition-all duration-300 disabled:opacity-60 disabled:cursor-not-allowed shadow-md text-sm sm:text-base tracking-wide min-h-[52px]"
              >
                {isLoading ? "Authenticating…" : "Enter Tenant Portal"}
              </motion.button>
            </form>
          </div>

          <div className="px-5 sm:px-8 pb-6 pt-3 border-t border-slate-100 bg-slate-50/50">
            <p className="text-center text-xs text-gray-500 font-medium mb-3">Quick Demo</p>
            <div className="grid grid-cols-1 gap-3 max-w-xs mx-auto">
              <a
                href="/tenant-login?demo=tenant"
                className="block text-center bg-gradient-to-r from-teal-600 to-teal-700 text-white py-3 rounded-xl hover:brightness-110 transition-all text-sm font-semibold shadow-sm min-h-[48px]"
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