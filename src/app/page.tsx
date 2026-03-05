"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaGoogle, FaArrowRight, FaUserTie, FaInfoCircle } from "react-icons/fa";
import { motion } from "framer-motion";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
        credentials: "include",           // Crucial: allows server-set cookies to be sent/received
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Login failed. Please check your credentials.");
      }

      // No client-side cookie manipulation anymore — session is HttpOnly
      // Server provides the safe redirect path
      router.push(data.redirect || "/property-owner-dashboard");
      router.refresh(); // Helps refresh server components with new auth state
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-blue-50/40">
      {/* LEFT: Branding section – hidden on mobile */}
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
        {/* Floating decorative bubbles */}
        <div className="absolute inset-0 pointer-events-none">
          {/* ... keep all your motion.div bubbles here ... (omitted for brevity) */}
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
            className="text-4xl sm:text-5xl xl:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-blue-700 via-blue-600 to-emerald-600 bg-clip-text text-transparent"
          >
            Property Intelligence
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.9 }}
            className="text-base sm:text-lg xl:text-xl font-light text-gray-700 leading-relaxed max-w-md mx-auto"
          >
            Real-time analytics • ROI tracking • Predictive vacancy insights
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="text-sm sm:text-base xl:text-lg font-medium text-emerald-700 tracking-wide"
          >
            See clearer. Decide smarter. Earn more.
          </motion.p>
        </div>
      </div>

      {/* RIGHT: Login Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-6 sm:py-10 md:py-12 bg-gradient-to-b from-white/70 to-slate-50/50">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="w-full max-w-md sm:max-w-lg bg-white/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden"
        >
          {/* Mobile-only logo */}
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
              <h1 className="text-2xl xs:text-3xl sm:text-3.5xl md:text-4xl font-extrabold bg-gradient-to-r from-blue-700 to-teal-600 bg-clip-text text-transparent">
                Owner Portal Login
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Secure access for property owners
              </p>
            </div>

            {/* Switch to Tenant Portal */}
            <div className="relative group">
              <Link
                href="/tenant-login"
                className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-teal-50 to-cyan-50 border border-teal-200 hover:border-teal-400 text-teal-800 font-semibold py-3 xs:py-3.5 px-4 xs:px-5 rounded-xl transition-all duration-300 shadow-sm hover:shadow active:scale-[0.98] text-sm xs:text-base"
              >
                <FaUserTie className="text-teal-600 text-lg" />
                <span>I'm a Tenant</span>
                <FaArrowRight className="text-teal-600 opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </Link>

              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <div
                  tabIndex={0}
                  className="relative flex items-center justify-center w-5 h-5 xs:w-6 xs:h-6 cursor-help outline-none focus:ring-2 focus:ring-teal-400 rounded-full"
                >
                  <FaInfoCircle className="text-teal-600/70 hover:text-teal-700 text-base xs:text-lg transition-colors" />

                  <div
                    className={`
                      absolute bottom-full right-0 mb-2 
                      hidden group-hover:block focus-within:block
                      pointer-events-none z-10
                    `}
                  >
                    <div className="bg-slate-800 text-white text-xs rounded-lg py-1.5 px-2.5 min-w-[160px] shadow-lg leading-snug">
                      For tenants currently renting a property<br />
                      <span className="text-teal-300">View lease, payments & maintenance requests</span>
                    </div>
                    <div className="absolute bottom-[-6px] right-3 w-0 h-0 border-l-5 border-l-transparent border-r-5 border-r-transparent border-t-5 border-t-slate-800" />
                  </div>
                </div>
              </div>
            </div>

            {error && (
              <div className="p-2.5 xs:p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl text-center">
                {error}
              </div>
            )}

            <div className="relative my-1 sm:my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white/80 px-3 xs:px-4 text-slate-500 font-medium">or</span>
              </div>
            </div>

            {/* Google Sign-In */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              type="button"
              onClick={() => (window.location.href = "/api/auth/google")}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-medium py-3 xs:py-3.5 rounded-xl transition-all shadow-sm disabled:opacity-60 text-sm xs:text-base"
            >
              <FaGoogle className="text-red-500 text-lg" />
              Continue with Google
            </motion.button>

            {/* Email + Password Form */}
            <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4 pt-1">
              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
                required
                autoComplete="email"
                className="w-full px-3.5 xs:px-4 py-3 bg-white/70 border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all placeholder:text-slate-400 text-sm xs:text-base shadow-inner"
              />

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full px-3.5 xs:px-4 py-3 pr-9 xs:pr-10 bg-white/70 border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all placeholder:text-slate-400 text-sm xs:text-base shadow-inner"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 xs:right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-teal-600 transition-colors"
                >
                  {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-semibold py-3 xs:py-3.5 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-sm xs:text-base tracking-wide"
              >
                {isLoading ? "Authenticating..." : "Sign In"}
              </motion.button>
            </form>

            <p className="text-center text-xs sm:text-sm text-slate-600 pt-1">
              New to Sorana?{" "}
              <Link href="/sign-up" className="text-teal-600 font-semibold hover:text-teal-700 hover:underline">
                Create account
              </Link>
            </p>
          </div>

          {/* Demo credentials filler – NO auto-submit */}
          <div className="px-4 xs:px-6 sm:px-8 py-4 sm:py-5 border-t border-slate-100 bg-slate-50/70">
            <p className="text-center text-xs text-slate-500 font-medium mb-2.5">Quick Demo Access</p>
            <button
              onClick={() => {
                setEmail("demo@admin.com");
                setPassword("Demo@2025!");
                // User must manually click "Sign In"
              }}
              className="block w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold py-3 rounded-xl text-center transition-all shadow-md text-sm xs:text-base"
            >
              Fill Demo Credentials
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}