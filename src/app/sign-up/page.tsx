"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaGoogle, FaArrowRight, FaCheck, FaTimes, FaChevronDown } from "react-icons/fa";
import Cookies from "js-cookie";
import Link from "next/link";
import { motion } from "framer-motion";
import { countries } from "countries-list";

interface CountryData {
  name: string;
  native: string;
  phone: number[];
  continent: string;
  capital: string;
  currency: string[];
  languages: string[];
  emoji: string;
  emojiU: string;
}

type Country = {
  code: string;
  name: string;
  phone: string;
  flag: string;
};

const countryList: Country[] = Object.entries(
  countries as unknown as Record<string, CountryData>
).map(([code, data]) => ({
  code,
  name: data.name,
  phone: String(data.phone[0]),
  flag: data.emoji,
}));

export default function SignUp() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+254");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");

  const [criteria, setCriteria] = useState({
    length: false,
    upper: false,
    number: false,
    special: false,
  });

  useEffect(() => {
    const length = password.length >= 8;
    const upper = /[A-Z]/.test(password);
    const number = /\d/.test(password);
    const special = /[@$!%*?&]/.test(password);

    setCriteria({ length, upper, number, special });
  }, [password]);

  const score = Object.values(criteria).filter(Boolean).length;
  const barColor =
    score === 4 ? "bg-teal-500" : score >= 2 ? "bg-yellow-500" : "bg-red-500";

  useEffect(() => {
    fetch("/api/csrf-token", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => d.success && setCsrfToken(d.csrfToken))
      .catch(() => setError("Security token missing"));
  }, []);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = countryList.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  );

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  useEffect(() => {
    if (success) {
      const t = setTimeout(() => router.push("/"), 5000);
      return () => clearTimeout(t);
    }
  }, [success, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }
    if (score < 4) {
      setError("Password must meet all criteria");
      setIsLoading(false);
      return;
    }
    if (!/^\d{6,15}$/.test(phone)) {
      setError("Phone must be 6–15 digits");
      setIsLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({
          name,
          email,
          password,
          phone: countryCode + phone,
          role: "propertyOwner",
          csrfToken,
        }),
        credentials: "include",
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message ?? "Signup failed");

      Cookies.set("userId", data.userId, { secure: true, sameSite: "Strict", expires: 7 });
      Cookies.set("role", data.role, { secure: true, sameSite: "Strict", expires: 7 });

      setSuccess("Account created – redirecting…");
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-blue-50/40">

{/* LEFT: Branding – hidden on mobile – refreshed content for signup */}
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
  {/* Floating subtle bubbles – slightly varied from login for distinction */}
  <div className="absolute inset-0 pointer-events-none">
    <motion.div
      className="absolute left-[12%] top-[15%] w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-teal-400/12 border border-teal-300/15 backdrop-blur-md"
      animate={{
        y: ["0%", "-40%", "10%", "-25%", "0%"],
        x: ["0%", "15%", "-10%", "8%", "0%"],
        scale: [1, 1.15, 0.92, 1.1, 1],
        opacity: [0.65, 0.88, 0.55, 0.8, 0.65],
      }}
      transition={{ duration: 24, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
    />
    <motion.div
      className="absolute right-[18%] top-[35%] w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-blue-400/14 border border-blue-300/18 backdrop-blur-sm"
      animate={{
        y: ["0%", "35%", "-20%", "15%", "0%"],
        x: ["0%", "-12%", "18%", "-6%", "0%"],
        scale: [1, 1.2, 0.98, 1.12, 1],
      }}
      transition={{ duration: 21, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 4 }}
    />
    <motion.div
      className="absolute left-[40%] bottom-[25%] w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-emerald-300/10"
      animate={{
        y: ["0%", "-50%", "5%", "-35%", "0%"],
        x: ["0%", "10%", "-15%", "5%", "0%"],
        scale: [1, 1.28, 0.88, 1.18, 1],
      }}
      transition={{ duration: 28, repeat: Infinity, repeatType: "reverse", delay: 2 }}
    />

    {/* Smaller decorative bubbles */}
    <motion.div className="absolute inset-0 opacity-40">
      <div className="absolute top-[20%] left-[50%] w-7 h-7 rounded-full bg-teal-400/22" />
      <div className="absolute top-[50%] right-[30%] w-6 h-6 rounded-full bg-blue-400/28" />
      <div className="absolute bottom-[30%] left-[65%] w-9 h-9 rounded-full bg-emerald-300/18" />
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
      className="text-4xl sm:text-5xl xl:text-6xl font-extrabold tracking-tight bg-gradient-to-r from-teal-700 via-teal-600 to-emerald-600 bg-clip-text text-transparent"
    >
      Maximize Your Returns
    </motion.h2>

    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4, duration: 0.9 }}
      className="text-base sm:text-lg xl:text-xl font-light text-gray-700 leading-relaxed max-w-md mx-auto"
    >
      Smart tools for property owners • Track income & expenses • Optimize occupancy • Grow your portfolio with confidence.
    </motion.p>

    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.55 }}
      className="text-sm sm:text-base xl:text-lg font-medium text-teal-700 tracking-wide"
    >
      Your properties. Smarter management. Better profits.
    </motion.p>
  </div>
</div>

      {/* RIGHT: Form – matched styling */}
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
              <h1 className="text-2xl xs:text-3xl sm:text-3.5xl md:text-4xl font-extrabold bg-gradient-to-r from-blue-700 to-teal-600 bg-clip-text text-transparent">
                Create Owner Account
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 font-medium">
                Get started in minutes
              </p>
            </div>

            {error && (
              <div className="p-2.5 xs:p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl text-center">
                {error}
              </div>
            )}

            {success && (
              <div className="p-2.5 xs:p-3.5 bg-green-50 border border-green-200 text-green-700 text-xs sm:text-sm rounded-xl text-center">
                {success}
              </div>
            )}

            {/* Google Button – matched */}
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

            <div className="relative my-1 sm:my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white/80 px-3 xs:px-4 text-slate-500 font-medium">or</span>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4 pt-1">
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3.5 xs:px-4 py-3 bg-white/70 border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all placeholder:text-slate-400 text-sm xs:text-base shadow-inner"
              />

              {/* Phone with country dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setOpen(!open)}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-sm text-slate-600 z-10 pointer-events-auto px-2"
                >
                  <span className="font-medium">{countryCode}</span>
                  <FaChevronDown className="text-xs" />
                </button>

                <input
                  type="tel"
                  placeholder="712345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))}
                  required
                  className="w-full pl-24 pr-3.5 xs:pr-4 py-3 bg-white/70 border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all placeholder:text-slate-400 text-sm xs:text-base shadow-inner"
                />

                {open && (
                  <div className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-md border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto z-30 text-sm">
                    <input
                      type="text"
                      placeholder="Search country or code..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full px-4 py-3 border-b border-slate-100 sticky top-0 bg-white/90 backdrop-blur-sm z-10 text-sm placeholder:text-slate-400"
                    />
                    <div className="py-1">
                      {filtered.map((c) => (
                        <button
                          key={c.code}
                          type="button"
                          onClick={() => {
                            setCountryCode("+" + c.phone);
                            setOpen(false);
                            setSearch("");
                          }}
                          className="w-full px-4 py-2.5 text-left hover:bg-teal-50/40 transition-colors flex items-center gap-3"
                        >
                          <span className="text-xl">{c.flag}</span>
                          <span className="flex-1">{c.name}</span>
                          <span className="text-slate-500">+{c.phone}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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

              <div className="relative">
                <input
                  type="password"
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="w-full px-3.5 xs:px-4 py-3 pr-9 xs:pr-10 bg-white/70 border border-slate-200 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all placeholder:text-slate-400 text-sm xs:text-base shadow-inner"
                />
              </div>

              {/* Password strength – kept but visually toned down to match login simplicity */}
              <div className="space-y-2 pt-1 text-xs">
                <div className="flex gap-1.5">
                  {[...Array(4)].map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-all ${i < score ? barColor : "bg-slate-200/70"}`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>{score === 4 ? "Strong" : score >= 2 ? "Medium" : "Weak"}</span>
                  <span>{score}/4</span>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                  {[
                    { label: "8+ characters", ok: criteria.length },
                    { label: "Uppercase", ok: criteria.upper },
                    { label: "Number", ok: criteria.number },
                    { label: "Special char", ok: criteria.special },
                  ].map((c) => (
                    <div key={c.label} className="flex items-center gap-1.5">
                      {c.ok ? (
                        <FaCheck className="text-teal-500" size={12} />
                      ) : (
                        <FaTimes className="text-slate-400" size={12} />
                      )}
                      <span className={c.ok ? "text-teal-700" : "text-slate-500"}>{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isLoading || !csrfToken || score < 4}
                className="w-full bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-semibold py-3 xs:py-3.5 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-sm xs:text-base tracking-wide mt-2"
              >
                {isLoading ? "Creating Account…" : "Create Account"}
              </motion.button>
            </form>

            <p className="text-center text-xs sm:text-sm text-slate-600 pt-1">
              Already have an account?{" "}
              <Link href="/" className="text-teal-600 font-semibold hover:text-teal-700 hover:underline">
                Sign in
              </Link>
            </p>
          </div>

          {/* Quick Demo section – matched */}
          <div className="px-4 xs:px-6 sm:px-8 py-4 sm:py-5 border-t border-slate-100 bg-slate-50/70">
            <p className="text-center text-xs text-slate-500 font-medium mb-2.5">Quick Demo Access</p>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="/?demo=owner"
                className="block text-center bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-semibold py-3 rounded-xl transition-all shadow-md text-sm"
              >
                Owner Demo
              </a>
              <a
                href="/tenant-login?demo=tenant"
                className="block text-center bg-gradient-to-r from-teal-600 to-teal-700 hover:from-teal-700 hover:to-teal-800 text-white font-semibold py-3 rounded-xl transition-all shadow-md text-sm"
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