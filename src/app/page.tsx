"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaGoogle, FaArrowRight, FaUserTie, FaInfoCircle } from "react-icons/fa";
import Cookies from "js-cookie";
import { motion } from "framer-motion";
import Link from "next/link";

export default function LoginPage() {
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
      setTimeout(() => submitForm(), 600);
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

    try {
      const res = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, role: "propertyOwner" }),
        credentials: "include",
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Login failed");

      Cookies.set("userId", data.userId, { secure: true, sameSite: "Strict", expires: 7 });
      Cookies.set("role", data.role, { secure: true, sameSite: "Strict", expires: 7 });

      router.push(data.redirect || "/dashboard");
    } catch (err: any) {
      setError(err.message || "Authentication failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-blue-50/40">
   {/* LEFT: Branding – hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-950 via-blue-950 to-teal-950/95 text-white items-center justify-center p-8 xl:p-16 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute -left-20 top-1/4 w-96 h-96 rounded-full bg-teal-400/10 blur-3xl"
            animate={{ x: [0, 80, 0], y: [0, -40, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 18, repeat: Infinity, repeatType: "reverse" }}
          />
          <motion.div
            className="absolute -right-20 bottom-1/4 w-96 h-96 rounded-full bg-cyan-400/10 blur-3xl"
            animate={{ x: [0, -60, 0], y: [0, 50, 0], scale: [1, 1.1, 1] }}
            transition={{ duration: 22, repeat: Infinity, repeatType: "reverse", delay: 4 }}
          />
        </div>

        <div className="relative z-10 max-w-xl text-center space-y-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}>
            <Image
              src="/logo.png"
              alt="Sorana"
              width={360}
              height={120}
              className="mx-auto drop-shadow-2xl max-w-[260px] xl:max-w-[340px]"
              priority
            />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.9 }}
            className="text-4xl xl:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-100 via-teal-200 to-blue-200 bg-clip-text text-transparent"
          >
            Property Intelligence
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.9 }}
            className="text-lg xl:text-2xl font-light text-cyan-100/90 leading-relaxed max-w-lg mx-auto"
          >
            Real-time analytics • ROI tracking • Predictive vacancy insights
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="text-base xl:text-lg font-medium text-teal-200/90 tracking-wide"
          >
            See clearer. Decide smarter. Earn more.
          </motion.p>
        </div>
      </div>

      {/* RIGHT: Form */}
      <div className="flex-1 flex items-center justify-center px-5 py-8 sm:py-12 bg-gradient-to-b from-white/70 to-slate-50/50">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="w-full max-w-md bg-white/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden"
        >
          {/* Mobile logo */}
          <div className="lg:hidden flex justify-center pt-7 pb-5">
            <Image
              src="/logo.png"
              alt="Sorana"
              width={240}
              height={80}
              className="drop-shadow-lg max-w-[200px] xs:max-w-[220px]"
              priority
            />
          </div>

          <div className="px-5 xs:px-6 sm:px-10 pt-5 sm:pt-6 pb-8 sm:pb-10 space-y-5 sm:space-y-6">
            <div className="text-center space-y-1.5">
              <h1 className="text-2xl xs:text-2.5xl sm:text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-blue-700 to-teal-600 bg-clip-text text-transparent">
                Owner Portal
              </h1>
              <p className="text-xs xs:text-sm sm:text-base text-slate-600 font-medium">
                Secure access for property owners
              </p>
            </div>

            {error && (
              <div className="p-3 xs:p-4 bg-red-50 border border-red-200 text-red-700 text-xs xs:text-sm rounded-xl text-center">
                {error}
              </div>
            )}

            {/* Tenant Portal Button with Info Tooltip */}
            <div className="relative group">
              <Link
                href="/tenant-login"
                className="group flex items-center justify-center gap-2.5 xs:gap-3 w-full bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 hover:border-teal-400 text-teal-800 font-semibold py-3.5 xs:py-4 px-5 xs:px-6 rounded-xl transition-all duration-300 shadow-sm hover:shadow-md hover:bg-teal-100/60 active:scale-[0.98] text-sm xs:text-base"
              >
                <FaUserTie className="text-teal-600 text-lg xs:text-xl group-hover:scale-110 transition-transform" />
                <span>I'm a Tenant</span>
                <FaArrowRight className="text-teal-600 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all text-sm xs:text-base" />
              </Link>

              {/* Info Icon + Tooltip */}
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <div className="relative flex items-center justify-center w-6 h-6 cursor-help">
                  <FaInfoCircle className="text-teal-600/70 hover:text-teal-700 text-lg transition-colors" />
                  
                  {/* Tooltip */}
                  <div className="absolute bottom-full right-0 mb-2 hidden group-hover:block z-10">
                    <div className="bg-slate-800 text-white text-xs rounded-lg py-2 px-3 min-w-[180px] shadow-lg leading-relaxed">
                      For tenants currently renting a property
                      <br />
                      <span className="text-teal-300">View lease, payments & maintenance requests</span>
                    </div>
                    {/* Small arrow */}
                    <div className="absolute bottom-[-6px] right-4 w-0 h-0 border-l-6 border-l-transparent border-r-6 border-r-transparent border-t-6 border-t-slate-800" />
                  </div>
                </div>
              </div>
            </div>

            <div className="relative my-1.5 sm:my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white/80 px-4 text-slate-500 font-medium">or</span>
              </div>
            </div>

            {/* Google Sign-In */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => (window.location.href = "/api/auth/google")}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2.5 xs:gap-3 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium py-3.5 xs:py-4 rounded-xl transition-all shadow-sm disabled:opacity-60 text-sm xs:text-base"
            >
              <FaGoogle className="text-red-500 text-lg xs:text-xl" />
              Continue with Google
            </motion.button>

            <form id="login-form" onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 pt-1 sm:pt-2">
              {/* ... rest of the form remains unchanged ... */}
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 xs:px-5 py-3.5 xs:py-4 bg-white/70 border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all placeholder:text-slate-400 text-sm xs:text-base shadow-inner"
              />

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-4 xs:px-5 py-3.5 xs:py-4 pr-10 xs:pr-12 bg-white/70 border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all placeholder:text-slate-400 text-sm xs:text-base shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 xs:right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-teal-600 transition-colors"
                >
                  {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-semibold py-3.5 xs:py-4 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-sm xs:text-base tracking-wide"
              >
                {isLoading ? "Authenticating..." : "Sign In"}
              </motion.button>
            </form>

            <p className="text-center text-xs xs:text-sm text-slate-600 pt-2">
              New to Sorana?{" "}
              <Link href="/sign-up" className="text-teal-600 font-semibold hover:text-teal-700 hover:underline">
                Create account
              </Link>
            </p>
          </div>

          {/* Quick Demo */}
          <div className="px-5 xs:px-6 sm:px-10 py-5 sm:py-6 border-t border-slate-100 bg-slate-50/70">
            <p className="text-center text-xs text-slate-500 font-medium mb-3 sm:mb-4">Quick Demo Access</p>
            <a
              href="/?demo=owner"
              className="block w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3.5 xs:py-4 rounded-xl text-center transition-all shadow-md text-sm xs:text-base"
            >
              Launch Owner Demo
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}