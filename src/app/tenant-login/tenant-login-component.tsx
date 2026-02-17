// app/tenant-login/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaGoogle, FaArrowRight, FaUserTie, FaInfoCircle } from "react-icons/fa";
import Cookies from "js-cookie";
import { motion } from "framer-motion";
import Link from "next/link";

export default function TenantLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [properties, setProperties] = useState<
    { id: string; name: string; address?: string }[]
  >([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Fetch available properties
  useEffect(() => {
    let mounted = true;

    async function loadProperties() {
      try {
        const res = await fetch("/api/public/properties", {
          cache: "no-store",
        });

        if (!res.ok) throw new Error("Failed to load properties");

        const data = await res.json();

        if (data.success && mounted) {
          setProperties(data.properties || []);
        } else if (mounted) {
          setError("Unable to load property list. Please try again.");
        }
      } catch (err) {
        if (mounted) {
          setError("Connection issue. Please check your internet.");
        }
      } finally {
        if (mounted) setLoadingProperties(false);
      }
    }

    loadProperties();

    return () => {
      mounted = false;
    };
  }, []);

  // Auto-fill demo credentials
  useEffect(() => {
    const demo = searchParams.get("demo");
    if (demo === "tenant" && properties.length > 0) {
      setEmail("tenant@demo.com");
      setPassword("Tenant@2025!");
      setPropertyId(properties[0]?.id || "");
      setTimeout(() => {
        const form = document.getElementById("tenant-login-form") as HTMLFormElement;
        form?.requestSubmit();
      }, 600);
    }
  }, [searchParams, properties]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!propertyId) {
      setError("Please select your property");
      return;
    }

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!password) {
      setError("Password is required");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      email: email.trim(),
      password,
      role: "tenant",
      propertyId,
    };

    try {
      const response = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            "Login failed. Please check your credentials and selected property."
        );
      }

      Cookies.set("userId", result.userId, {
        expires: 7,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      Cookies.set("role", result.role, {
        expires: 7,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      router.push(result.redirect || "/tenant-dashboard");
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-blue-50/40">
      {/* LEFT: Branding – hidden on mobile – bright with floating bubbles */}
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
        {/* Floating bubbles to fill the section */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute left-[10%] top-[10%] w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-teal-400/12 border border-teal-300/15 backdrop-blur-md"
            animate={{
              y: ["0%", "-35%", "15%", "-20%", "0%"],
              x: ["0%", "12%", "-8%", "5%", "0%"],
              scale: [1, 1.12, 0.95, 1.08, 1],
              opacity: [0.7, 0.9, 0.6, 0.85, 0.7],
            }}
            transition={{ duration: 22, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
          <motion.div
            className="absolute right-[15%] top-[30%] w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-blue-400/15 border border-blue-300/20 backdrop-blur-sm"
            animate={{
              y: ["0%", "30%", "-25%", "10%", "0%"],
              x: ["0%", "-10%", "15%", "-5%", "0%"],
              scale: [1, 1.18, 1, 1.1, 1],
            }}
            transition={{ duration: 19, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 3 }}
          />
          <motion.div
            className="absolute left-[35%] top-[55%] w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-emerald-300/10"
            animate={{
              y: ["0%", "-45%", "0%", "-30%", "0%"],
              x: ["0%", "8%", "-12%", "0%", "0%"],
              scale: [1, 1.25, 0.9, 1.15, 1],
            }}
            transition={{ duration: 26, repeat: Infinity, repeatType: "reverse", delay: 1.5 }}
          />
          <motion.div
            className="absolute right-[25%] bottom-[20%] w-14 h-14 rounded-full bg-teal-500/12 backdrop-blur-sm"
            animate={{
              y: ["0%", "40%", "-15%", "25%", "0%"],
              scale: [1, 1.2, 1, 1.1, 1],
            }}
            transition={{ duration: 17, repeat: Infinity, repeatType: "reverse", delay: 6 }}
          />
          <motion.div
            className="absolute left-[60%] bottom-[40%] w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-blue-500/10"
            animate={{
              y: ["0%", "-50%", "10%", "-35%", "0%"],
              x: ["0%", "-15%", "10%", "0%", "0%"],
            }}
            transition={{ duration: 21, repeat: Infinity, repeatType: "reverse", delay: 8 }}
          />
          <motion.div
            className="absolute left-[20%] bottom-[60%] w-18 h-18 rounded-full bg-emerald-400/8 border border-emerald-200/10 backdrop-blur-lg"
            animate={{
              y: ["0%", "20%", "-40%", "5%", "0%"],
              scale: [1, 1.15, 0.95, 1.05, 1],
            }}
            transition={{ duration: 24, repeat: Infinity, repeatType: "reverse", delay: 4.5 }}
          />

          {/* Smaller filler bubbles */}
          <motion.div className="absolute inset-0 opacity-40">
            <div className="absolute top-[15%] left-[45%] w-6 h-6 rounded-full bg-teal-400/20" />
            <div className="absolute top-[45%] right-[35%] w-5 h-5 rounded-full bg-blue-400/25" />
            <div className="absolute bottom-[25%] left-[70%] w-8 h-8 rounded-full bg-emerald-300/15" />
            <div className="absolute bottom-[50%] right-[50%] w-7 h-7 rounded-full bg-teal-300/18" />
            <div className="absolute top-[70%] left-[25%] w-9 h-9 rounded-full bg-blue-300/12" />
          </motion.div>
        </div>

        <div className="relative z-10 max-w-lg text-center space-y-6 xl:space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}>
            <Image
              src="/logo.png"
              alt="Sorana Property Managers Limited"
              width={400}
              height={140}
              className="mx-auto drop-shadow-xl max-w-[260px] sm:max-w-[300px] xl:max-w-[360px]"
              priority
            />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.9 }}
            className="text-4xl sm:text-5xl xl:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-teal-700 via-teal-600 to-blue-600 bg-clip-text text-transparent"
          >
            Tenant Portal
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.9 }}
            className="text-base sm:text-lg xl:text-xl font-light text-gray-700 leading-relaxed max-w-md mx-auto"
          >
            Pay rent • Report issues • View statements • Communicate securely
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="text-sm sm:text-base xl:text-lg font-medium text-teal-700 tracking-wide"
          >
            Simple. Secure. Always connected.
          </motion.p>
        </div>
      </div>

      {/* RIGHT: Form – compact & consistent with owner */}
      <div className="flex-1 flex items-center justify-center px-4 py-6 sm:py-10 md:py-12 bg-gradient-to-b from-white/70 to-slate-50/50">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="w-full max-w-md sm:max-w-lg bg-white/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden"
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

          <div className="px-4 xs:px-6 sm:px-8 md:px-10 pt-4 sm:pt-5 pb-6 sm:pb-8 space-y-4 sm:space-y-5">
            <div className="text-center space-y-1">
              <h1 className="text-2xl xs:text-3xl sm:text-3.5xl md:text-4xl font-extrabold bg-gradient-to-r from-teal-700 to-blue-600 bg-clip-text text-transparent">
                Tenant Portal
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Secure access to your rental dashboard
              </p>
            </div>

            {error && (
              <div className="p-2.5 xs:p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl text-center">
                {error}
              </div>
            )}

            {/* Owner Portal Link with tooltip */}
            <div className="relative group">
              <Link
                href="/"
                className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 hover:border-blue-400 text-blue-800 font-semibold py-3 xs:py-3.5 px-4 xs:px-5 rounded-xl transition-all duration-300 shadow-sm hover:shadow active:scale-[0.98] text-sm xs:text-base"
              >
                <FaUserTie className="text-blue-600 text-lg" />
                <span>I'm a Property Owner</span>
                <FaArrowRight className="text-blue-600 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </Link>

              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <div className="relative flex items-center justify-center w-5 h-5 xs:w-6 xs:h-6 cursor-help">
                  <FaInfoCircle className="text-blue-600/70 hover:text-blue-700 text-base xs:text-lg transition-colors" />
                  <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-10">
                    <div className="bg-slate-800 text-white text-xs rounded-lg py-1.5 px-2.5 min-w-[160px] shadow-lg leading-snug">
                      For property owners & managers
                      <br />
                      <span className="text-teal-300">Manage properties, tenants & finances</span>
                    </div>
                    <div className="absolute bottom-[-6px] right-3 w-0 h-0 border-l-5 border-l-transparent border-r-5 border-r-transparent border-t-5 border-t-slate-800" />
                  </div>
                </div>
              </div>
            </div>

            <div className="relative my-1 sm:my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white/80 px-3 xs:px-4 text-slate-500 font-medium">or</span>
              </div>
            </div>

            {/* Google Sign-In (placeholder) */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => (window.location.href = "/api/auth/google?role=tenant")}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium py-3 xs:py-3.5 rounded-xl transition-all shadow-sm disabled:opacity-60 text-sm xs:text-base"
            >
              <FaGoogle className="text-red-500 text-lg" />
              Continue with Google
            </motion.button>

            <form id="tenant-login-form" onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4 pt-1">
              {/* Property Selection */}
              <div>
                <label htmlFor="property" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Your Property
                </label>
                {loadingProperties ? (
                  <div className="w-full px-3.5 xs:px-4 py-3 bg-white/70 border border-slate-200 rounded-xl text-slate-500 text-sm">
                    Loading properties...
                  </div>
                ) : properties.length === 0 ? (
                  <div className="w-full px-3.5 xs:px-4 py-3 bg-yellow-50/70 border border-yellow-200 rounded-xl text-yellow-800 text-sm">
                    No properties available. Contact support.
                  </div>
                ) : (
                  <select
                    id="property"
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    required
                    disabled={isSubmitting || loadingProperties}
                    className="w-full px-3.5 xs:px-4 py-3 bg-white/70 border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all disabled:opacity-60 text-sm xs:text-base shadow-inner"
                  >
                    <option value="">Select your property</option>
                    {properties.map((prop) => (
                      <option key={prop.id} value={prop.id}>
                        {prop.name}
                        {prop.address && ` — ${prop.address}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Email */}
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isSubmitting}
                className="w-full px-3.5 xs:px-4 py-3 bg-white/70 border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all placeholder:text-slate-400 text-sm xs:text-base shadow-inner"
              />

              {/* Password */}
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  disabled={isSubmitting}
                  className="w-full px-3.5 xs:px-4 py-3 pr-9 xs:pr-10 bg-white/70 border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all placeholder:text-slate-400 text-sm xs:text-base shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={isSubmitting}
                  className="absolute right-2.5 xs:right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-teal-600 transition-colors"
                >
                  {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isSubmitting || loadingProperties || !propertyId}
                className="w-full bg-gradient-to-r from-teal-600 to-teal-500 hover:from-teal-700 hover:to-teal-600 text-white font-semibold py-3 xs:py-3.5 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-sm xs:text-base tracking-wide"
              >
                {isSubmitting ? "Authenticating..." : "Sign In"}
              </motion.button>
            </form>
          </div>

          {/* Quick Demo */}
          <div className="px-4 xs:px-6 sm:px-8 py-4 sm:py-5 border-t border-slate-100 bg-slate-50/70">
            <p className="text-center text-xs text-slate-500 font-medium mb-2.5">Quick Demo Access</p>
            <a
              href="/tenant-login?demo=tenant"
              className="block w-full bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-semibold py-3 rounded-xl text-center transition-all shadow-md text-sm xs:text-base"
            >
              Launch Tenant Demo
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}