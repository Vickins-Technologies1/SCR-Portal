"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  FaEye,
  FaEyeSlash,
  FaGoogle,
  FaArrowRight,
  FaCheck,
  FaTimes,
  FaChevronDown,
} from "react-icons/fa";
import Cookies from "js-cookie";
import Link from "next/link";
import { motion } from "framer-motion";
import { countries } from "countries-list";

/* -------------------------------------------------
   Extend country data with emoji
   ------------------------------------------------- */
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

/* -------------------------------------------------
   Build list – safe cast via `unknown`
   ------------------------------------------------- */
const countryList: Country[] = Object.entries(
  countries as unknown as Record<string, CountryData>
).map(([code, data]) => ({
  code,
  name: data.name,
  phone: String(data.phone[0]),
  flag: data.emoji,
}));

/* -------------------------------------------------
   Component
   ------------------------------------------------- */
export default function SignUp() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+254"); // Kenya default
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");

  /* ---- Password strength (live update) ---- */
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

  /* ---- CSRF ---- */
  useEffect(() => {
    fetch("/api/csrf-token", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => d.success && setCsrfToken(d.csrfToken))
      .catch(() => setError("Security token missing"));
  }, []);

  /* ---- Country dropdown ---- */
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const filtered = countryList.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
  );

  // Close on outside click
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  /* ---- Success redirect ---- */
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => router.push("/"), 5000);
      return () => clearTimeout(t);
    }
  }, [success, router]);

  /* ---- Submit ---- */
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
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-gray-50 to-blue-50">
      {/* LEFT: Branding */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-blue-900 to-teal-600 text-white items-center justify-center p-8 relative overflow-hidden">
        <div className="text-center space-y-6 z-10">
          <Image
            src="/logo.png"
            alt="Logo"
            width={220}
            height={120}
            className="mx-auto drop-shadow-xl"
          />
          <h2 className="text-4xl font-black tracking-tight">
            Sorana Property Managers Ltd
          </h2>
          <p className="text-lg opacity-90">Manage properties. Rent smarter.</p>
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

      {/* RIGHT: Form */}
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
            <h1 className="text-2xl font-bold text-blue-900">Create Account</h1>
            <p className="text-sm text-gray-600">Property Owner</p>
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
          {success && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-2 bg-green-50 text-green-700 text-xs rounded-lg text-center border border-green-200"
            >
              {success}
            </motion.p>
          )}

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

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition text-sm"
            />

            {/* Phone + Country */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                onClick={() => setOpen(!open)}
                className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-xs text-gray-600 z-10"
              >
                <span>{countryCode}</span>
                <FaChevronDown className="text-xs" />
              </button>

              <input
                type="tel"
                placeholder="712345678"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))
                }
                required
                className="w-full pl-20 pr-4 py-2.5 border border-blue-200 rounded-lg focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition text-sm"
              />

              {open && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-blue-200 rounded-lg shadow-lg max-h-64 overflow-y-auto z-20">
                  <input
                    type="text"
                    placeholder="Search country..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full px-3 py-2 border-b border-gray-200 text-xs sticky top-0 bg-white z-10"
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
                        className="w-full px-3 py-2 text-left text-xs hover:bg-blue-50 flex items-center gap-2"
                      >
                        <span>{c.flag}</span>
                        <span className="flex-1">{c.name}</span>
                        <span className="text-gray-500">+{c.phone}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

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

            {/* Confirm */}
            <input
              type="password"
              placeholder="Confirm Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:border-teal-500 focus:ring-2 focus:ring-teal-100 transition text-sm"
            />

            {/* Strength Meter – Live Ticking */}
            <div className="space-y-2">
              <div className="flex gap-1">
                {[...Array(4)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={false}
                    animate={{ scale: i < score ? 1.1 : 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className={`h-1.5 flex-1 rounded-full transition-all ${
                      i < score ? barColor : "bg-gray-200"
                    }`}
                  />
                ))}
              </div>

              <p className="text-xs text-gray-600 flex justify-between">
                <span>
                  {score === 4 ? "Strong" : score >= 2 ? "Medium" : "Weak"} Password
                </span>
                <span>{score}/4</span>
              </p>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { label: "8+ characters", ok: criteria.length },
                  { label: "Uppercase letter", ok: criteria.upper },
                  { label: "Number", ok: criteria.number },
                  { label: "Special char", ok: criteria.special },
                ].map((c, i) => (
                  <motion.span
                    key={c.label}
                    initial={false}
                    animate={{
                      color: c.ok ? "#14b8a6" : "#9ca3af",
                      scale: c.ok ? 1.05 : 1,
                    }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    className="flex items-center gap-1.5 font-medium"
                  >
                    {c.ok ? (
                      <FaCheck size={11} className="text-teal-500" />
                    ) : (
                      <FaTimes size={11} className="text-gray-400" />
                    )}
                    {c.label}
                  </motion.span>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || !csrfToken || score < 4}
              className="w-full bg-gradient-to-r from-blue-600 to-teal-500 text-white font-semibold py-2.5 rounded-xl hover:from-blue-700 hover:to-teal-600 transform hover:scale-[1.02] transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isLoading ? "Creating…" : "Create Account"}
            </button>
          </form>

          <p className="text-center text-xs text-gray-600">
            Have an account?{" "}
            <Link href="/" className="text-teal-600 font-medium hover:underline">
              Sign In
            </Link>
          </p>

          {/* Demo Buttons */}
          <div className="pt-4 border-t border-gray-200 space-y-2">
            <p className="text-center text-xs font-medium text-gray-500">Try Demo</p>
            <div className="grid grid-cols-2 gap-2">
              <a
                href="/?demo=owner"
                className="block text-center bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition text-xs font-medium"
              >
                Owner Demo
              </a>
              <a
                href="/?demo=tenant"
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