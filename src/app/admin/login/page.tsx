"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import Cookies from "js-cookie";
import { motion } from "framer-motion";

interface LoginResponse {
  success: boolean;
  user?: { _id: string; role: string };
  message?: string;
}

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formErrors, setFormErrors] = useState<{ email?: string; password?: string }>({});

  // Redirect if already logged in as admin
  useEffect(() => {
    const userId = Cookies.get("userId");
    const role = Cookies.get("role");
    if (userId && role === "admin") {
      router.replace("/admin/dashboard");
    }
  }, [router]);

  const validateForm = () => {
    const errors: typeof formErrors = {};
    if (!email.trim()) errors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = "Invalid email format";
    if (!password.trim()) errors.password = "Password is required";
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
        Cookies.set("userId", data.user._id, {
          expires: 7,
          secure: true,
          sameSite: "Strict",
        });
        Cookies.set("role", data.user.role, {
          expires: 7,
          secure: true,
          sameSite: "Strict",
        });
        router.push("/admin/dashboard");
      } else {
        setError(data.message || "Invalid credentials");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-blue-50/40">
      {/* LEFT: Branding – hidden on mobile */}
      <div
        className="
          hidden lg:flex lg:w-1/2 
          bg-gradient-to-br from-white via-slate-50/70 to-white 
          text-gray-900 items-center justify-center 
          p-6 xl:p-12 relative overflow-hidden
          shadow-[-20px_0_30px_-15px_rgba(0,0,0,0.08)] 
          lg:shadow-[-30px_0_40px_-20px_rgba(0,0,0,0.10)]
        "
      >
        {/* Subtle floating elements – admin flavor with indigo/blue tones */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute left-[10%] top-[15%] w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-indigo-400/12 border border-indigo-300/15 backdrop-blur-md"
            animate={{
              y: ["0%", "-38%", "12%", "-22%", "0%"],
              x: ["0%", "14%", "-9%", "6%", "0%"],
              scale: [1, 1.14, 0.93, 1.09, 1],
              opacity: [0.68, 0.9, 0.58, 0.82, 0.68],
            }}
            transition={{ duration: 23, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
          <motion.div
            className="absolute right-[16%] top-[38%] w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-blue-500/14 border border-blue-400/18 backdrop-blur-sm"
            animate={{
              y: ["0%", "32%", "-18%", "14%", "0%"],
              x: ["0%", "-11%", "16%", "-7%", "0%"],
              scale: [1, 1.19, 0.97, 1.11, 1],
            }}
            transition={{ duration: 20, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 3.5 }}
          />
          <motion.div
            className="absolute left-[38%] bottom-[28%] w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-indigo-300/10"
            animate={{
              y: ["0%", "-48%", "8%", "-32%", "0%"],
              x: ["0%", "9%", "-14%", "4%", "0%"],
              scale: [1, 1.26, 0.89, 1.16, 1],
            }}
            transition={{ duration: 27, repeat: Infinity, repeatType: "reverse", delay: 1.8 }}
          />

          {/* Small decorative dots */}
          <motion.div className="absolute inset-0 opacity-40">
            <div className="absolute top-[22%] left-[48%] w-6 h-6 rounded-full bg-indigo-400/20" />
            <div className="absolute top-[52%] right-[32%] w-5 h-5 rounded-full bg-blue-400/25" />
            <div className="absolute bottom-[32%] left-[68%] w-8 h-8 rounded-full bg-indigo-300/15" />
          </motion.div>
        </div>

        <div className="relative z-10 max-w-lg text-center space-y-4 xl:space-y-6">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}>
            <Image
              src="/logo.png"
              alt="Sorana Admin Portal"
              width={400}
              height={140}
              className="mx-auto drop-shadow-xl max-w-[220px] sm:max-w-[260px] xl:max-w-[300px]"
              priority
            />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.9 }}
            className="text-2xl sm:text-3xl xl:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-700 via-indigo-600 to-blue-600 bg-clip-text text-transparent"
          >
            Admin Control Center
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.9 }}
            className="text-sm sm:text-base xl:text-lg font-light text-gray-700 leading-relaxed max-w-md mx-auto"
          >
            System oversight • User management • Property moderation • Analytics & configuration
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="text-xs sm:text-sm xl:text-base font-medium text-indigo-700 tracking-wide"
          >
            Secure. Powerful. Administrative access only.
          </motion.p>
        </div>
      </div>

      {/* RIGHT: Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-6 sm:py-8 md:py-10 bg-gradient-to-b from-white/70 to-slate-50/50">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="w-full max-w-sm sm:max-w-md bg-white/80 backdrop-blur-2xl rounded-xl shadow-2xl border border-slate-200/60 overflow-hidden"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center pt-6 pb-4">
            <Image
              src="/logo.png"
              alt="Sorana"
              width={240}
              height={80}
              className="drop-shadow-lg max-w-[180px] xs:max-w-[200px]"
              priority
            />
          </div>

          <div className="px-4 xs:px-5 sm:px-6 md:px-7 pt-4 sm:pt-5 pb-5 sm:pb-6 space-y-3.5 sm:space-y-4">
            <div className="text-center space-y-1">
              <h1 className="text-lg xs:text-xl sm:text-2xl font-extrabold bg-gradient-to-r from-indigo-700 to-blue-600 bg-clip-text text-transparent">
                Admin Portal
              </h1>
              <p className="text-[10px] sm:text-xs text-slate-600 font-medium">
                Restricted access – administrators only
              </p>
            </div>

            {error && (
              <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-3.5 pt-1">
              <div>
                <input
                  type="email"
                  placeholder="Admin email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      email: e.target.value.trim()
                        ? /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(e.target.value)
                          ? undefined
                          : "Invalid email format"
                        : "Email is required",
                    }));
                  }}
                  className={`w-full px-3 py-2.5 bg-white/70 border rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/40 transition-all placeholder:text-slate-400 text-xs shadow-inner ${
                    formErrors.email ? "border-red-400" : "border-slate-200"
                  }`}
                />
                {formErrors.email && (
                  <p className="mt-1.5 text-[10px] text-red-600">{formErrors.email}</p>
                )}
              </div>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFormErrors((prev) => ({
                      ...prev,
                      password: e.target.value.trim() ? undefined : "Password is required",
                    }));
                  }}
                  className={`w-full px-3 py-2.5 pr-9 bg-white/70 border rounded-lg focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200/40 transition-all placeholder:text-slate-400 text-xs shadow-inner ${
                    formErrors.password ? "border-red-400" : "border-slate-200"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-indigo-600 transition-colors"
                >
                  {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
                {formErrors.password && (
                  <p className="mt-1.5 text-[10px] text-red-600">{formErrors.password}</p>
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading || !!formErrors.email || !!formErrors.password}
                className={`w-full py-2.5 font-semibold text-white rounded-lg transition-all shadow-lg flex items-center justify-center gap-2 text-xs ${
                  isLoading || formErrors.email || formErrors.password
                    ? "bg-slate-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700"
                }`}
              >
                {isLoading && (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {isLoading ? "Authenticating..." : "Sign In to Admin Panel"}
              </motion.button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
