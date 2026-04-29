"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  FaEye,
  FaEyeSlash,
  FaGoogle,
  FaCheck,
  FaTimes,
  FaChevronDown,
  FaBuilding,
  FaHotel,
} from "react-icons/fa";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { countries } from "countries-list";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";

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
  const [step, setStep] = useState(0);
  const [managementType, setManagementType] = useState<"rentals" | "airbnb">("rentals");
  const [tier, setTier] = useState<"free" | "premium">("free");

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
      ? isNameValid && isEmailValid
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
      const t = setTimeout(() => router.push("/"), 6000);
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
      setError("Please enter your full name and a valid email address.");
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
          tier,
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
        "Your account is pending admin approval.\n" +
        "You will receive an email once it is activated.\n\n" +
        "Redirecting to home page..."
      );

      // Clear form
      setName("");
      setEmail("");
      setPhone("");
      setPassword("");
      setConfirmPassword("");
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

            {step === 0 && (
              <>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => (window.location.href = "/api/auth/google")}
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
                            <span className="block text-xs font-semibold text-foreground">
                              Rentals
                            </span>
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
                            <span className="block text-xs font-semibold text-foreground">
                              Airbnb
                            </span>
                            <span className="block text-[10px] text-muted-foreground">
                              Short-term stays & STR ops
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                        Choose Your Tier
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setTier("free")}
                          className={`rounded-xl border px-3.5 py-3 text-left transition-all ${
                            tier === "free"
                              ? "border-primary/40 bg-primary/10 ring-1 ring-primary/30"
                              : "border-border bg-muted/30 hover:bg-muted/50"
                          }`}
                          aria-pressed={tier === "free"}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="block text-xs font-semibold text-foreground">Free (Forever)</span>
                              <span className="block text-[10px] text-muted-foreground mt-0.5">
                                1 property free for life + full Tenants & Property details.
                              </span>
                            </div>
                            <span className="shrink-0 rounded-full bg-foreground/5 px-2.5 py-1 text-[10px] font-semibold text-foreground">
                              Free
                            </span>
                          </div>
                          <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                            <li>• Dashboard access (with limited insights)</li>
                            <li>• Locked premium operations & automation</li>
                          </ul>
                        </button>

                        <button
                          type="button"
                          onClick={() => setTier("premium")}
                          className={`rounded-xl border px-3.5 py-3 text-left transition-all ${
                            tier === "premium"
                              ? "border-primary/40 bg-primary/10 ring-1 ring-primary/30"
                              : "border-border bg-muted/30 hover:bg-muted/50"
                          }`}
                          aria-pressed={tier === "premium"}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <span className="block text-xs font-semibold text-foreground">Premium (1%)</span>
                              <span className="block text-[10px] text-muted-foreground mt-0.5">
                                Unlock automated tenant payments + full operations suite.
                              </span>
                            </div>
                            <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">
                              1%
                            </span>
                          </div>
                          <ul className="mt-2 space-y-1 text-[10px] text-muted-foreground">
                            <li>• Automated payments & integrations</li>
                            <li>• Advanced reports, users, expenses</li>
                          </ul>
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
                            {managementType === "airbnb" ? "Airbnb / Short-Term" : "Rentals / Long-Term"}
                          </p>
                          <button
                            type="button"
                            onClick={() =>
                              setManagementType((prev) => (prev === "airbnb" ? "rentals" : "airbnb"))
                            }
                            className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition"
                          >
                            Switch
                          </button>
                        </div>
                      </div>

                      <div className="rounded-xl border border-border bg-muted/30 p-3.5 xs:p-4 space-y-2 sm:col-span-2">
                        <p className="text-[10px] text-muted-foreground">Tier</p>
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-semibold text-sm">
                            {tier === "premium" ? "Premium (1%)" : "Free (Forever)"}
                          </p>
                          <button
                            type="button"
                            onClick={() => setTier((prev) => (prev === "premium" ? "free" : "premium"))}
                            className="rounded-full bg-primary/10 px-3 py-1 text-[10px] font-semibold text-primary hover:bg-primary/20 transition"
                          >
                            Switch
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-border bg-[linear-gradient(110deg,rgba(66,199,117,0.10),rgba(66,199,117,0.04))] px-3.5 xs:px-4 py-3 text-[11px] text-muted-foreground">
                      Everything looks good? Make quick edits right here, then create your account.
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
                    disabled={isLoading || !csrfToken || score < 5}
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

          {/* Quick Demo section */}
          <div className="px-4 xs:px-6 sm:px-8 py-4 sm:py-5 border-t border-border bg-muted/40">
            <p className="text-center text-[10px] text-muted-foreground font-medium mb-2">Quick Demo Access</p>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="/?demo=owner"
                className="block text-center bg-[linear-gradient(110deg,rgba(30,58,138,0.12),rgba(30,58,138,0.04))] border border-border hover:border-primary/50 text-foreground font-semibold py-2.5 rounded-xl transition-all shadow-md text-xs xs:text-sm sm:text-base"
              >
                Owner Demo
              </a>
              <a
                href="/tenant-login?demo=tenant"
                className="block text-center bg-[linear-gradient(110deg,rgba(30,58,138,0.12),rgba(30,58,138,0.04))] border border-border hover:border-primary/50 text-foreground font-semibold py-2.5 rounded-xl transition-all shadow-md text-xs xs:text-sm sm:text-base"
              >
                Tenant Demo
              </a>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
    </PublicThemeWrapper>
  );
}
