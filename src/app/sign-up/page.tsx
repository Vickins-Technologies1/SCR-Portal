"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createPortal } from "react-dom";
import {
  FaEye,
  FaEyeSlash,
  FaGoogle,
  FaCheck,
  FaTimes,
  FaChevronDown,
  FaBuilding,
  FaHotel,
  FaRegStar,
} from "react-icons/fa";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { countries } from "countries-list";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import { buildGoogleAuthStartUrl } from "@/lib/google-auth-client";

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

  const [packageTier, setPackageTier] = useState<"free" | "one_percent" | "full_management" | null>(null);
  const [isPackageModalOpen, setIsPackageModalOpen] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState("+254");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [acceptedTermsAndPrivacy, setAcceptedTermsAndPrivacy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");
  const [step, setStep] = useState(0);
  const [managementType, setManagementType] = useState<"rentals" | "airbnb" | null>(null);
  const derivedTier: "free" | "premium" | null =
    packageTier === "free" ? "free" : packageTier ? "premium" : null;

  const [criteria, setCriteria] = useState({
    length: false,
    upper: false,
    lower: false,
    number: false,
    special: false,
  });

  const steps = [
    { title: "Basics", subtitle: "Tell us who you are" },
    { title: "Contact", subtitle: "How we can reach you" },
    { title: "Security", subtitle: "Keep your account safe" },
    { title: "Review", subtitle: "Confirm and finish" },
  ];

  useEffect(() => {
    setIsPackageModalOpen(!packageTier && !success);
  }, [packageTier, success]);

  useEffect(() => {
    setIsMounted(true);
    setPortalTarget((document.querySelector(".sorana-theme") as HTMLElement | null) ?? document.body);
  }, []);

  useEffect(() => {
    if (!isPackageModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev || "auto";
    };
  }, [isPackageModalOpen]);

  useEffect(() => {
    const length = password.length >= 8;
    const upper = /[A-Z]/.test(password);
    const lower = /[a-z]/.test(password);
    const number = /\d/.test(password);
    const special = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password);

    setCriteria({ length, upper, lower, number, special });
  }, [password]);

  const score = Object.values(criteria).filter(Boolean).length;
  const barColor =
    score === 5 ? "bg-primary" : score >= 3 ? "bg-foreground/30" : "bg-muted";

  const fullPhone = countryCode + phone;
  const isNameValid = name.trim().length >= 2;
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isPhoneValid = /^\+\d{8,15}$/.test(fullPhone);
  const isPasswordValid = score === 5;
  const isPasswordMatch = password.length > 0 && password === confirmPassword;

  const canProceed =
    step === 0
      ? isNameValid && isEmailValid && !!managementType
      : step === 1
        ? isPhoneValid
        : step === 2
          ? isPasswordValid && isPasswordMatch
          : true;

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
      const t = setTimeout(() => router.push("/portals/owner"), 6000);
      return () => clearTimeout(t);
    }
  }, [success, router]);

  useEffect(() => {
    setOpen(false);
  }, [step]);

  const goNext = () => {
    setError(null);
    if (canProceed) {
      setStep((prev) => Math.min(prev + 1, steps.length - 1));
      return;
    }

    if (step === 0) {
      setError("Please enter your full name, a valid email address, and select a management type.");
      return;
    }
    if (step === 1) {
      setError("Please provide a valid phone number.");
      return;
    }
    if (step === 2) {
      setError("Create a strong password and confirm it to continue.");
    }
  };

  const goBack = () => {
    setError(null);
    setStep((prev) => Math.max(prev - 1, 0));
  };

  const handleGoogleLogin = async () => {
    if (isLoading) return;
    try {
      window.location.href = await buildGoogleAuthStartUrl({
        portal: "owner",
        action: "signup",
        managementType: managementType || "rentals",
        tier: derivedTier || "premium",
        packageTier: packageTier || "one_percent",
      });
    } catch {
      setError("Unable to start Google sign-in.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step < steps.length - 1) {
      goNext();
      return;
    }
    setError(null);
    setIsLoading(true);

    // Client-side validations
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    if (score < 5) {
      setError("Password must meet all the requirements shown below");
      setIsLoading(false);
      return;
    }

    if (!/^\+\d{8,15}$/.test(fullPhone)) {
      setError("Phone number must start with + and contain 8–15 digits total");
      setIsLoading(false);
      return;
    }

    if (!isNameValid || !isEmailValid) {
      setError("Please provide a valid name and email address.");
      setIsLoading(false);
      return;
    }

    if (!acceptedTermsAndPrivacy) {
      setError("Please accept the Terms of Service and Privacy Policy to continue.");
      setIsLoading(false);
      return;
    }

    if (!packageTier) {
      setError("Please select a package to continue.");
      setIsPackageModalOpen(true);
      setIsLoading(false);
      return;
    }

    if (!managementType) {
      setError("Please select a management type to continue.");
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
          name: name.trim(),
          email: email.trim(),
          password,
          phone: fullPhone,
          role: "propertyOwner",
          managementType,
          tier: derivedTier,
          packageTier,
          acceptedTermsAndPrivacy,
          csrfToken,
        }),
        credentials: "include",
      });

      const data = await res.json();

      if (!data.success) {
        throw new Error(data.message || "Signup failed");
      }

      setSuccess(
        "Account created successfully!\n\n" +
        "You can sign in now.\n\n" +
        "Redirecting to login..."
      );

      // Clear form
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setConfirmPassword("");
      setAcceptedTermsAndPrivacy(false);
      setManagementType(null);
      setPackageTier(null);
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <PublicThemeWrapper>
    <div className="min-h-[100svh] flex flex-col lg:flex-row bg-background text-foreground">
      {/* LEFT: Branding */}
      <div
        className="
          hidden lg:flex lg:w-1/2 
          bg-background 
          text-foreground items-center justify-center 
          p-6 xl:p-12 relative overflow-hidden
          shadow-[-20px_0_30px_-15px_rgba(30,58,138,0.08)] 
          lg:shadow-[-30px_0_40px_-20px_rgba(30,58,138,0.10)]
        "
      >
        {/* Floating bubbles */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute left-[10%] top-[10%] w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-blue-400/12 border border-blue-300/15 backdrop-blur-md"
            animate={{
              y: ["0%", "-35%", "15%", "-20%", "0%"],
              x: ["0%", "12%", "-8%", "5%", "0%"],
              scale: [1, 1.12, 0.95, 1.08, 1],
              opacity: [0.7, 0.9, 0.6, 0.85, 0.7],
            }}
            transition={{ duration: 22, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
          <motion.div
            className="absolute right-[15%] top-[30%] w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-emerald-400/15 border border-emerald-300/20 backdrop-blur-sm"
            animate={{
              y: ["0%", "30%", "-25%", "10%", "0%"],
              x: ["0%", "-10%", "15%", "-5%", "0%"],
              scale: [1, 1.18, 1, 1.1, 1],
            }}
            transition={{ duration: 19, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 3 }}
          />
          <motion.div
            className="absolute left-[35%] top-[55%] w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-teal-300/10"
            animate={{
              y: ["0%", "-45%", "0%", "-30%", "0%"],
              x: ["0%", "8%", "-12%", "0%", "0%"],
              scale: [1, 1.25, 0.9, 1.15, 1],
            }}
            transition={{ duration: 26, repeat: Infinity, repeatType: "reverse", delay: 1.5 }}
          />
          <motion.div
            className="absolute right-[25%] bottom-[20%] w-14 h-14 rounded-full bg-blue-500/12 backdrop-blur-sm"
            animate={{
              y: ["0%", "40%", "-15%", "25%", "0%"],
              scale: [1, 1.2, 1, 1.1, 1],
            }}
            transition={{ duration: 17, repeat: Infinity, repeatType: "reverse", delay: 6 }}
          />
          <motion.div
            className="absolute left-[60%] bottom-[40%] w-10 h-10 sm:w-16 sm:h-16 rounded-full bg-emerald-500/10"
            animate={{
              y: ["0%", "-50%", "10%", "-35%", "0%"],
              x: ["0%", "-15%", "10%", "0%", "0%"],
            }}
            transition={{ duration: 21, repeat: Infinity, repeatType: "reverse", delay: 8 }}
          />
          <motion.div
            className="absolute left-[20%] bottom-[60%] w-18 h-18 rounded-full bg-teal-400/8 border border-teal-200/10 backdrop-blur-lg"
            animate={{
              y: ["0%", "20%", "-40%", "5%", "0%"],
              scale: [1, 1.15, 0.95, 1.05, 1],
            }}
            transition={{ duration: 24, repeat: Infinity, repeatType: "reverse", delay: 4.5 }}
          />

          {/* Smaller decorative bubbles */}
          <motion.div className="absolute inset-0 opacity-40">
            <div className="absolute top-[15%] left-[45%] w-6 h-6 rounded-full bg-blue-400/20" />
            <div className="absolute top-[45%] right-[35%] w-5 h-5 rounded-full bg-emerald-400/25" />
            <div className="absolute bottom-[25%] left-[70%] w-8 h-8 rounded-full bg-teal-300/15" />
            <div className="absolute bottom-[50%] right-[50%] w-7 h-7 rounded-full bg-blue-300/18" />
            <div className="absolute top-[70%] left-[25%] w-9 h-9 rounded-full bg-emerald-300/12" />
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
            className="text-3xl sm:text-4xl xl:text-5xl font-extrabold tracking-tight text-gradient-primary"
          >
            Maximize Your Returns
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.9 }}
            className="text-sm sm:text-base xl:text-lg font-light text-muted-foreground leading-relaxed max-w-md mx-auto"
          >
            Smart tools for property owners • Track income & expenses • Optimize occupancy • Grow your portfolio with confidence.
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="text-xs sm:text-sm xl:text-base font-medium text-primary tracking-wide"
          >
            Your properties. Smarter management. Better profits.
          </motion.p>
        </div>
      </div>

      {/* RIGHT: Form */}
      <div className="flex-1 flex items-center justify-center px-4 py-3 sm:py-6 md:py-8 bg-background/80">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="w-full max-w-md sm:max-w-lg bg-card/90 backdrop-blur-2xl rounded-2xl shadow-2xl border border-border overflow-hidden text-[0.9rem] sm:text-[0.95rem]"
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

          <div className="px-4 xs:px-6 sm:px-8 md:px-10 pt-3 sm:pt-4 pb-4 sm:pb-5 space-y-3">
            <div className="text-center space-y-1">
              <h1 className="text-lg xs:text-xl sm:text-2xl md:text-2.5xl font-extrabold text-gradient-primary">
                Create Owner Account
              </h1>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">
                Step {step + 1} of {steps.length} • {steps[step].subtitle}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                {steps.map((stepItem, index) => {
                  const isActive = index === step;
                  const isComplete = index < step;
                  return (
                    <motion.button
                      key={stepItem.title}
                      type="button"
                      onClick={() => {
                        if (index <= step) {
                          setError(null);
                          setStep(index);
                        }
                      }}
                      disabled={index > step}
                      whileHover={index <= step ? { y: -2, scale: 1.01 } : undefined}
                      whileTap={index <= step ? { scale: 0.99 } : undefined}
                      animate={{
                        y: isActive ? -2 : 0,
                        boxShadow: isActive
                          ? "0 14px 30px rgba(16,185,129,0.18)"
                          : "0 0 0 rgba(0,0,0,0)",
                      }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className={`flex flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1 transition-all ${
                        isActive ? "bg-primary/10 ring-1 ring-primary/20" : "bg-transparent"
                      } ${index > step ? "opacity-60" : "hover:bg-muted/60"}`}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold transition-all ${
                          isActive || isComplete
                            ? "bg-primary text-primary-foreground shadow"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {index + 1}
                      </span>
                      <span className="hidden sm:block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {stepItem.title}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted/70 overflow-hidden">
                <motion.div
                  className="h-1.5 rounded-full bg-[linear-gradient(110deg,#42c775,#34b46d)]"
                  initial={{ width: "0%" }}
                  animate={{ width: `${((step + 1) / steps.length) * 100}%` }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                />
              </div>
            </div>

            {error && (
              <div className="p-2.5 xs:p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl text-center whitespace-pre-line">
                {error}
              </div>
            )}

            {success && (
              <div className="p-2.5 xs:p-3.5 bg-green-50 border border-green-200 text-green-700 text-xs sm:text-sm rounded-xl text-center whitespace-pre-line">
                {success}
              </div>
            )}

            {isMounted && portalTarget && createPortal(
              <AnimatePresence>
                {isPackageModalOpen && (
                  <motion.div
                    className="fixed inset-0 z-[9999] bg-background text-foreground overflow-y-auto"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: "easeInOut" }}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Choose your package"
                  >
                    <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(66,199,117,0.16),_transparent_58%)]" />
                    <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 bg-[radial-gradient(rgba(148,163,184,0.24)_1px,transparent_1px)] bg-[length:22px_22px]" />

                    <motion.div
                      className="mx-auto max-w-7xl px-4 sm:px-6 pt-10 sm:pt-14 pb-[max(env(safe-area-inset-bottom),28px)] min-h-[100svh]"
                      initial={{ opacity: 0, y: 14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 14 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                    >
                      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 pt-2 pb-5 bg-background/80 backdrop-blur-xl border-b border-border">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
                              Choose your package
                            </p>
                            <h2 className="mt-2 text-2xl sm:text-3xl font-semibold text-foreground text-display text-balance">
                              Pick the plan that fits you
                            </h2>
                            <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
                              Select a package to continue signing up. You can change this later in your account.
                            </p>
                          </div>

                          {packageTier && (
                            <button
                              type="button"
                              onClick={() => setIsPackageModalOpen(false)}
                              className="shrink-0 rounded-full border border-border bg-card px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted-foreground hover:text-foreground transition"
                            >
                              Close
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="mt-8 grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
                        {/* Free */}
                        <button
                          type="button"
                          onClick={() => {
                            setPackageTier("free");
                            setIsPackageModalOpen(false);
                          }}
                          className={`text-left rounded-[32px] border p-6 sm:p-7 transition shadow-[0_22px_55px_-45px_rgba(15,23,42,0.35)] backdrop-blur ${
                            packageTier === "free"
                              ? "border-primary/35 ring-1 ring-primary/25 bg-card"
                              : "border-border bg-card hover:border-primary/25"
                          }`}
                          aria-pressed={packageTier === "free"}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-foreground">Free</h3>
                              <p className="mt-1 text-xs text-muted-foreground">For getting started</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                              $0
                            </span>
                          </div>

                          <div className="mt-5 flex items-end gap-2">
                            <span className="text-muted-foreground text-sm">$</span>
                            <span className="text-4xl font-semibold text-foreground leading-none">0</span>
                            <span className="pb-1 text-[11px] text-muted-foreground">Forever</span>
                          </div>

                          <p className="mt-2 text-[11px] text-muted-foreground">
                            Includes 1 property and basic tracking. Upgrade anytime.
                          </p>

                          <p className="mt-4 text-sm font-semibold text-foreground">
                            Track your property basics
                          </p>

                          <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
                            {[
                              "1 property free",
                              "Tenants & property details",
                              "Basic reports and reminders",
                              "Maintenance request logging",
                              "Email support",
                            ].map((item) => (
                              <li key={item} className="flex items-start gap-3">
                                <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-xl bg-muted">
                                  <FaCheck className="text-primary" size={12} />
                                </span>
                                <span className="text-foreground/90">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </button>

                        {/* Standard / Airbnb */}
                        <button
                          type="button"
                          onClick={() => {
                            setPackageTier("one_percent");
                            setIsPackageModalOpen(false);
                          }}
                          className={`text-left rounded-[32px] border p-6 sm:p-7 transition shadow-[0_22px_55px_-45px_rgba(15,23,42,0.35)] backdrop-blur ${
                            packageTier === "one_percent"
                              ? "border-primary/35 ring-1 ring-primary/25 bg-card"
                              : "border-border bg-card hover:border-primary/25"
                          }`}
                          aria-pressed={packageTier === "one_percent"}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-foreground">Standard Management</h3>
                              <p className="mt-1 text-xs text-muted-foreground">Great for hands-on owners</p>
                            </div>
                            <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                              1% / 10%
                            </span>
                          </div>

                          <div className="mt-5 space-y-3">
                            <div className="flex items-end justify-between gap-3">
                              <span className="text-muted-foreground text-xs uppercase tracking-[0.22em]">Rentals</span>
                              <span className="text-4xl font-semibold text-foreground leading-none">1%</span>
                            </div>
                            <div className="flex items-end justify-between gap-3">
                              <span className="text-muted-foreground text-xs uppercase tracking-[0.22em]">Airbnb</span>
                              <span className="text-4xl font-semibold text-foreground leading-none">10%</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              Fees apply on collections/bookings. Cancel anytime.
                            </p>
                          </div>

                          <p className="mt-4 text-sm font-semibold text-foreground">
                            Simple, transparent management
                          </p>

                          <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
                            {[
                              "Rent collection (rentals)",
                              "10% fee on Airbnb bookings",
                              "Tenant/guest notifications",
                              "Owner payouts & reconciliation",
                              "Monthly statements",
                            ].map((item) => (
                              <li key={item} className="flex items-start gap-3">
                                <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-xl bg-muted">
                                  <FaCheck className="text-primary" size={12} />
                                </span>
                                <span className="text-foreground/90">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </button>

                        {/* Full management */}
                        <button
                          type="button"
                          onClick={() => {
                            setPackageTier("full_management");
                            setIsPackageModalOpen(false);
                          }}
                          className={`relative overflow-hidden text-left rounded-[32px] border p-6 sm:p-7 transition shadow-[0_28px_70px_-55px_rgba(66,199,117,0.45)] backdrop-blur ${
                            packageTier === "full_management"
                              ? "border-primary/45 ring-1 ring-primary/30 bg-card"
                              : "border-border bg-card hover:border-primary/30"
                          }`}
                          aria-pressed={packageTier === "full_management"}
                        >
                          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(66,199,117,0.22),_transparent_58%)]" />
                          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />

                          <div className="relative flex items-start justify-between gap-3">
                            <div>
                              <h3 className="text-lg font-semibold text-foreground">Full Management</h3>
                              <p className="mt-1 text-xs text-muted-foreground">Done-for-you operations</p>
                            </div>
                            <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                              <FaRegStar size={12} />
                              Popular
                            </span>
                          </div>

                          <div className="relative mt-5 flex items-end gap-2">
                            <span className="text-muted-foreground text-sm">From</span>
                            <span className="text-4xl font-semibold text-foreground leading-none">5–15%</span>
                            <span className="pb-1 text-[11px] text-muted-foreground">management fee</span>
                          </div>

                          <p className="relative mt-2 text-[11px] text-muted-foreground">
                            Custom rate depends on property type and scope. Includes onboarding & setup.
                          </p>

                          <p className="relative mt-4 text-sm font-semibold text-foreground">
                            Maximise performance and peace of mind
                          </p>

                          <ul className="relative mt-6 space-y-3 text-xs text-muted-foreground">
                            {[
                              "Tenant sourcing & vetting",
                              "Maintenance coordination",
                              "Rent enforcement and reporting",
                              "Airbnb setup & guest turnovers",
                              "Dedicated support team",
                            ].map((item) => (
                              <li key={item} className="flex items-start gap-3">
                                <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-xl bg-primary/10">
                                  <FaCheck className="text-primary" size={12} />
                                </span>
                                <span className="text-foreground/90">{item}</span>
                              </li>
                            ))}
                          </ul>
                        </button>
                      </div>

                      <div className="mt-6 rounded-2xl border border-border bg-muted/30 px-5 py-4 text-xs text-muted-foreground">
                        Account access level:{" "}
                        <span className="font-semibold text-foreground">
                          {packageTier ? (derivedTier === "premium" ? "Premium" : "Free") : "—"}
                        </span>
                        .
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>,
              portalTarget
            )}

            {step === 0 && (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 border border-border bg-[linear-gradient(110deg,rgba(255,255,255,0.98),rgba(66,199,117,0.08))] hover:bg-[linear-gradient(110deg,rgba(255,255,255,0.98),rgba(66,199,117,0.14))] text-foreground font-medium py-2.5 xs:py-3 rounded-xl transition-all shadow-sm disabled:opacity-60 text-xs xs:text-sm sm:text-base"
                >
                  <FaGoogle className="text-red-500 text-lg" />
                  Continue with Google
                </motion.button>

                <div className="relative my-1 sm:my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-background/80 px-3 xs:px-4 text-muted-foreground font-medium">or</span>
                  </div>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4 pt-1">
              <AnimatePresence mode="wait">
                {false && (
                  <motion.div
                    key="step-0"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4 sm:space-y-5"
                  >
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground text-center">
                        Choose your package
                      </p>
                      <p className="text-sm text-muted-foreground text-center">
                        Pick a plan that matches how hands-on you want to be. You can change later.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:gap-4 lg:grid-cols-3">
                      {/* Free */}
                      <div
                        className={`relative rounded-3xl border p-5 sm:p-6 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.35)] backdrop-blur transition ${
                          packageTier === "free"
                            ? "border-primary/35 ring-1 ring-primary/25 bg-card"
                            : "border-border bg-card hover:border-primary/25"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-foreground">Free</h3>
                            <p className="mt-1 text-xs text-muted-foreground">For getting started</p>
                          </div>
                          {packageTier === "free" && (
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                              Selected
                            </span>
                          )}
                        </div>

                        <div className="mt-5 flex items-end gap-2">
                          <span className="text-muted-foreground text-sm">$</span>
                          <span className="text-4xl font-semibold text-foreground leading-none">0</span>
                          <span className="pb-1 text-[11px] text-muted-foreground">Forever</span>
                        </div>

                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Includes 1 property and basic tracking. Upgrade anytime.
                        </p>

                        <p className="mt-4 text-sm font-semibold text-foreground">
                          Track your property basics
                        </p>

                        <button
                          type="button"
                          onClick={() => setPackageTier("free")}
                          className={`mt-5 w-full rounded-full px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] transition ${
                            packageTier === "free"
                              ? "bg-muted text-muted-foreground cursor-default"
                              : "bg-foreground text-background hover:bg-foreground/90"
                          }`}
                          aria-pressed={packageTier === "free"}
                        >
                          {packageTier === "free" ? "Your package" : "Select Free"}
                        </button>

                        <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
                          {[
                            "1 property free",
                            "Tenants & property details",
                            "Basic reports and reminders",
                            "Maintenance request logging",
                            "Email support",
                          ].map((item) => (
                            <li key={item} className="flex items-start gap-3">
                              <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-xl bg-muted">
                                <FaCheck className="text-primary" size={12} />
                              </span>
                              <span className="text-foreground/90">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* 1% */}
                      <div
                        className={`relative rounded-3xl border p-5 sm:p-6 shadow-[0_18px_45px_-35px_rgba(15,23,42,0.35)] backdrop-blur transition ${
                          packageTier === "one_percent"
                            ? "border-primary/35 ring-1 ring-primary/25 bg-card"
                            : "border-border bg-card hover:border-primary/25"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-foreground">Standard Management</h3>
                            <p className="mt-1 text-xs text-muted-foreground">Great for hands-on owners</p>
                          </div>
                          {packageTier === "one_percent" && (
                            <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                              Selected
                            </span>
                          )}
                        </div>

                        <div className="mt-5 space-y-3">
                          <div className="flex items-end justify-between gap-3">
                            <span className="text-muted-foreground text-xs uppercase tracking-[0.22em]">Rentals</span>
                            <span className="text-4xl font-semibold text-foreground leading-none">1%</span>
                          </div>
                          <div className="flex items-end justify-between gap-3">
                            <span className="text-muted-foreground text-xs uppercase tracking-[0.22em]">Airbnb</span>
                            <span className="text-4xl font-semibold text-foreground leading-none">10%</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Fees apply on collections/bookings. Cancel anytime.
                          </p>
                        </div>

                        <p className="mt-4 text-sm font-semibold text-foreground">
                          Simple, transparent management
                        </p>

                        <button
                          type="button"
                          onClick={() => setPackageTier("one_percent")}
                          className={`mt-5 w-full rounded-full px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] transition ${
                            packageTier === "one_percent"
                              ? "bg-muted text-muted-foreground cursor-default"
                              : "bg-foreground text-background hover:bg-foreground/90"
                          }`}
                          aria-pressed={packageTier === "one_percent"}
                        >
                          {packageTier === "one_percent" ? "Your package" : "Select 1% Tier"}
                        </button>

                        <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
                          {[
                            "Rent collection (rentals)",
                            "10% fee on Airbnb bookings",
                            "Tenant/guest notifications",
                            "Owner payouts & reconciliation",
                            "Monthly statements",
                          ].map((item) => (
                            <li key={item} className="flex items-start gap-3">
                              <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-xl bg-muted">
                                <FaCheck className="text-primary" size={12} />
                              </span>
                              <span className="text-foreground/90">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Full management */}
                      <div
                        className={`relative overflow-hidden rounded-3xl border p-5 sm:p-6 shadow-[0_18px_55px_-35px_rgba(66,199,117,0.35)] backdrop-blur transition ${
                          packageTier === "full_management"
                            ? "border-primary/45 ring-1 ring-primary/30 bg-card"
                            : "border-border bg-card hover:border-primary/30"
                        }`}
                      >
                        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(66,199,117,0.22),_transparent_58%)]" />
                        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />

                        <div className="relative flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-lg font-semibold text-foreground">Full Management</h3>
                            <p className="mt-1 text-xs text-muted-foreground">Done-for-you operations</p>
                          </div>
                          <span className="inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-primary">
                            <FaRegStar size={12} />
                            Popular
                          </span>
                        </div>

                        <div className="relative mt-5 flex items-end gap-2">
                          <span className="text-muted-foreground text-sm">From</span>
                          <span className="text-4xl font-semibold text-foreground leading-none">5–15%</span>
                          <span className="pb-1 text-[11px] text-muted-foreground">management fee</span>
                        </div>

                        <p className="relative mt-2 text-[11px] text-muted-foreground">
                          Custom rate depends on property type and scope. Includes onboarding & setup.
                        </p>

                        <p className="relative mt-4 text-sm font-semibold text-foreground">
                          Maximise performance and peace of mind
                        </p>

                        <button
                          type="button"
                          onClick={() => setPackageTier("full_management")}
                          className={`relative mt-5 w-full rounded-full px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.24em] transition ${
                            packageTier === "full_management"
                              ? "bg-primary/20 text-primary cursor-default"
                              : "bg-primary text-primary-foreground hover:bg-primary-hover"
                          }`}
                          aria-pressed={packageTier === "full_management"}
                        >
                          {packageTier === "full_management" ? "Your package" : "Select Full Management"}
                        </button>

                        <ul className="relative mt-6 space-y-3 text-xs text-muted-foreground">
                          {[
                            "Tenant sourcing & vetting",
                            "Maintenance coordination",
                            "Rent enforcement and reporting",
                            "Airbnb setup & guest turnovers",
                            "Dedicated support team",
                          ].map((item) => (
                            <li key={item} className="flex items-start gap-3">
                              <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-xl bg-primary/10">
                                <FaCheck className="text-primary" size={12} />
                              </span>
                              <span className="text-foreground/90">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 0 && (
                  <motion.div
                    key="step-0"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3.5 sm:space-y-4"
                  >
                    <input
                      type="text"
                      placeholder="Full Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      className="w-full px-3.5 xs:px-4 py-2.5 bg-background/70 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner"
                    />

                    <input
                      type="email"
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                      className="w-full px-3.5 xs:px-4 py-2.5 bg-background/70 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner"
                    />

                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                        Management Type
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setManagementType("rentals")}
                          className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all ${
                            managementType === "rentals"
                              ? "border-primary/40 bg-primary/10 ring-1 ring-primary/30"
                              : "border-border bg-muted/30 hover:bg-muted/50"
                          }`}
                          aria-pressed={managementType === "rentals"}
                        >
                          <span className="h-9 w-9 rounded-2xl bg-white/70 flex items-center justify-center shadow-sm">
                            <FaBuilding className="text-primary text-lg" />
                          </span>
                          <span>
                            <span className="block text-xs font-semibold text-foreground">Rentals</span>
                            <span className="block text-[10px] text-muted-foreground">
                              Long-term property management
                            </span>
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setManagementType("airbnb")}
                          className={`flex items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-all ${
                            managementType === "airbnb"
                              ? "border-primary/40 bg-primary/10 ring-1 ring-primary/30"
                              : "border-border bg-muted/30 hover:bg-muted/50"
                          }`}
                          aria-pressed={managementType === "airbnb"}
                        >
                          <span className="h-9 w-9 rounded-2xl bg-white/70 flex items-center justify-center shadow-sm">
                            <FaHotel className="text-primary text-lg" />
                          </span>
                          <span>
                            <span className="block text-xs font-semibold text-foreground">Airbnb</span>
                            <span className="block text-[10px] text-muted-foreground">
                              Short-term stays & STR ops
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 1 && (
                  <motion.div
                    key="step-1"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3.5 sm:space-y-4"
                  >
                    <div className="relative" ref={dropdownRef}>
                      <button
                        type="button"
                        onClick={() => setOpen(!open)}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-sm text-muted-foreground z-10 pointer-events-auto px-2"
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
                        className="w-full pl-24 pr-3.5 xs:pr-4 py-2.5 bg-background/70 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner"
                      />

                      {open && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl max-h-64 overflow-y-auto z-30 text-sm">
                          <input
                            type="text"
                            placeholder="Search country or code..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full px-4 py-3 border-b border-border sticky top-0 bg-card/90 backdrop-blur-sm z-10 text-sm placeholder:text-muted-foreground"
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
                                className="w-full px-4 py-2.5 text-left hover:bg-muted/70 transition-colors flex items-center gap-3"
                              >
                                <span className="text-xl">{c.flag}</span>
                                <span className="flex-1">{c.name}</span>
                                <span className="text-muted-foreground">+{c.phone}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-xl border border-border bg-muted/40 px-3.5 xs:px-4 py-2.5 text-[11px] text-muted-foreground">
                      We will only use your number for account security and critical updates.
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key="step-2"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3.5 sm:space-y-4"
                  >
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full px-3.5 xs:px-4 py-2.5 pr-9 xs:pr-10 bg-background/70 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 xs:right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
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
                        className="w-full px-3.5 xs:px-4 py-2.5 pr-9 xs:pr-10 bg-background/70 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner"
                      />
                    </div>

                    <div className="space-y-2 pt-1 text-xs">
                      <div className="flex gap-1.5">
                        {[...Array(5)].map((_, i) => (
                          <div
                            key={i}
                            className={`h-1.5 flex-1 rounded-full transition-all ${i < score ? barColor : "bg-muted/70"}`}
                          />
                        ))}
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>{score === 5 ? "Strong" : score >= 3 ? "Medium" : "Weak"}</span>
                        <span>{score}/5</span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        {[
                          { label: "8+ characters", ok: criteria.length },
                          { label: "Uppercase letter", ok: criteria.upper },
                          { label: "Lowercase letter", ok: criteria.lower },
                          { label: "Number", ok: criteria.number },
                          { label: "Special character", ok: criteria.special },
                        ].map((c) => (
                          <div key={c.label} className="flex items-center gap-1.5">
                            {c.ok ? (
                              <FaCheck className="text-primary" size={12} />
                            ) : (
                              <FaTimes className="text-muted-foreground" size={12} />
                            )}
                            <span className={c.ok ? "text-primary" : "text-muted-foreground"}>{c.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key="step-3"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-3.5 sm:space-y-4"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="rounded-xl border border-border bg-muted/30 p-3.5 xs:p-4 space-y-2">
                        <p className="text-[10px] text-muted-foreground">Full Name</p>
                        <input
                          type="text"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Full Name"
                          className="w-full px-3.5 py-2 bg-background/80 border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-xs sm:text-sm shadow-inner"
                        />
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 p-3.5 xs:p-4 space-y-2">
                        <p className="text-[10px] text-muted-foreground">Email</p>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Email address"
                          className="w-full px-3.5 py-2 bg-background/80 border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-xs sm:text-sm shadow-inner"
                        />
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 p-3.5 xs:p-4 space-y-2 sm:col-span-2">
                        <p className="text-[10px] text-muted-foreground">Phone</p>
                        <div className="relative" ref={dropdownRef}>
                          <button
                            type="button"
                            onClick={() => setOpen(!open)}
                            className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-xs text-muted-foreground z-10 pointer-events-auto px-2"
                          >
                            <span className="font-medium">{countryCode}</span>
                            <FaChevronDown className="text-[10px]" />
                          </button>
                          <input
                            type="tel"
                            placeholder="712345678"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 15))}
                            className="w-full pl-20 pr-3.5 py-2 bg-background/80 border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-xs sm:text-sm shadow-inner"
                          />

                          {open && (
                            <div className="absolute top-full left-0 right-0 mt-2 bg-card/95 backdrop-blur-md border border-border rounded-xl shadow-2xl max-h-56 overflow-y-auto z-30 text-xs">
                              <input
                                type="text"
                                placeholder="Search country or code..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full px-3.5 py-2 border-b border-border sticky top-0 bg-card/90 backdrop-blur-sm z-10 text-xs placeholder:text-muted-foreground"
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
                                    className="w-full px-3.5 py-2 text-left hover:bg-muted/70 transition-colors flex items-center gap-2"
                                  >
                                    <span className="text-lg">{c.flag}</span>
                                    <span className="flex-1">{c.name}</span>
                                    <span className="text-muted-foreground">+{c.phone}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 p-3.5 xs:p-4 space-y-2">
                        <p className="text-[10px] text-muted-foreground">Password</p>
                        <div className="relative">
                          <input
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Password"
                            className="w-full px-3.5 py-2 pr-9 bg-background/80 border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-xs sm:text-sm shadow-inner"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                          >
                            {showPassword ? <FaEyeSlash size={16} /> : <FaEye size={16} />}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 p-3.5 xs:p-4 space-y-2">
                        <p className="text-[10px] text-muted-foreground">Confirm Password</p>
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Confirm password"
                          className="w-full px-3.5 py-2 bg-background/80 border border-border rounded-lg focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all text-xs sm:text-sm shadow-inner"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Strength: {score === 5 ? "Strong" : score >= 3 ? "Medium" : "Weak"}
                        </p>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 p-3.5 xs:p-4 space-y-2 sm:col-span-2">
                        <p className="text-[10px] text-muted-foreground">Account Type</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm">Property Owner</p>
                          <span className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold text-primary">
                            Default
                          </span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 p-3.5 xs:p-4 space-y-2 sm:col-span-2">
                        <p className="text-[10px] text-muted-foreground">Management Type</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm">
                            {!managementType
                              ? "Not selected"
                              : managementType === "airbnb"
                                ? "Airbnb / Short-Term"
                                : "Rentals / Long-Term"}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              if (!managementType) {
                                setManagementType("rentals");
                                return;
                              }
                              setManagementType((prev) => (prev === "airbnb" ? "rentals" : "airbnb"));
                            }}
                            className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition"
                          >
                            {!managementType ? "Select" : "Switch"}
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 p-3.5 xs:p-4 space-y-2 sm:col-span-2">
                        <p className="text-[10px] text-muted-foreground">Package</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm">
                            {!packageTier
                              ? "Not selected"
                              : packageTier === "free"
                                ? "Free Tier"
                                : packageTier === "one_percent"
                                  ? "Standard Management"
                                  : "Full Management 5–15% Tier"}
                          </p>
                          <button
                            type="button"
                            onClick={() => setIsPackageModalOpen(true)}
                            className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition"
                          >
                            Change
                          </button>
                        </div>
                        <p className="text-[10px] text-muted-foreground">
                          Access level: {derivedTier === "premium" ? "Premium" : "Free"}.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-[linear-gradient(110deg,rgba(66,199,117,0.10),rgba(66,199,117,0.04))] px-3.5 xs:px-4 py-3 text-[11px] text-muted-foreground">
                      Everything looks good? Make quick edits right here, then create your account.
                    </div>

                    <div className="rounded-xl border border-border bg-muted/30 p-3.5 xs:p-4">
                      <label className="flex items-start gap-2.5 text-[11px] sm:text-xs text-muted-foreground leading-snug cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={acceptedTermsAndPrivacy}
                          onChange={(e) => setAcceptedTermsAndPrivacy(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-border bg-background/70 text-primary focus:ring-2 focus:ring-primary/30"
                          required
                        />
                        <span>
                          I agree to the{" "}
                          <Link
                            href="https://www.soranapropertymanagers.com/terms"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary font-semibold hover:underline"
                          >
                            Terms of Service
                          </Link>{" "}
                          and{" "}
                          <Link
                            href="https://www.soranapropertymanagers.com/privacy"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary font-semibold hover:underline"
                          >
                            Privacy Policy
                          </Link>
                          .
                        </span>
                      </label>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={goBack}
                  disabled={step === 0}
                  className="w-1/2 rounded-xl border border-border py-2.5 text-xs xs:text-sm font-semibold text-muted-foreground hover:text-foreground hover:border-primary/40 transition-all disabled:opacity-50"
                >
                  Back
                </button>
                {step < steps.length - 1 ? (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={goNext}
                    disabled={!canProceed}
                    className="w-1/2 bg-[linear-gradient(110deg,#42c775,#34b46d)] hover:bg-[linear-gradient(110deg,#34b46d,#42c775)] text-primary-foreground font-semibold py-2.5 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-xs xs:text-sm sm:text-base tracking-wide"
                  >
                    Continue
                  </motion.button>
                ) : (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={
                    isLoading ||
                    !csrfToken ||
                    !packageTier ||
                    !managementType ||
                    !isNameValid ||
                    !isEmailValid ||
                    !isPhoneValid ||
                    score < 5 ||
                    !isPasswordMatch ||
                    !acceptedTermsAndPrivacy
                  }
                  className="w-1/2 bg-[linear-gradient(110deg,#42c775,#34b46d)] hover:bg-[linear-gradient(110deg,#34b46d,#42c775)] text-primary-foreground font-semibold py-2.5 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-xs xs:text-sm sm:text-base tracking-wide"
                  >
                    {isLoading ? "Creating Account…" : "Create Account"}
                  </motion.button>
                )}
              </div>
            </form>

            <p className="text-center text-[10px] sm:text-[11px] text-muted-foreground pt-1">
              Already have an account?{" "}
              <Link href="/" className="text-primary font-semibold hover:underline">
                Sign in
              </Link>
            </p>
          </div>

        </motion.div>
      </div>
    </div>
    </PublicThemeWrapper>
  );
}
