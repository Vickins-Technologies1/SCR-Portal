"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaTimes } from "react-icons/fa";
import Cookies from "js-cookie";
import { motion, AnimatePresence } from "framer-motion";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import {
  getBiometricCredentials,
  getPinCredentials,
  hasBiometricCredentials,
  hasPinSetupForKind,
  isBiometricsAvailable,
  isNativeCapacitor,
  saveBiometricCredentials,
  setPinCredentials,
  setUserOptedOutOfQuickLoginPrompt,
  userOptedOutOfQuickLoginPrompt,
} from "@/lib/quick-login";
import { signInAdmin } from "@/lib/signin-client";

interface LoginResponse {
  success: boolean;
  userId?: string;
  role?: string;
  redirect?: string;
  requiresOtp?: boolean;
  otpId?: string;
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
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpId, setOtpId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [pinReady, setPinReady] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinMode, setPinMode] = useState<"login" | "setup" | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const autoVerifyRef = useRef<string>("");

  // Redirect if already logged in as admin
  useEffect(() => {
    const userId = Cookies.get("userId");
    const role = Cookies.get("role");
    if (userId && role === "admin") {
      router.replace("/admin/dashboard");
    }
  }, [router]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const native = await isNativeCapacitor();
      if (!native || cancelled) return;
      const [bioAvail, bioSaved, pinSaved] = await Promise.all([
        isBiometricsAvailable(),
        hasBiometricCredentials("admin"),
        hasPinSetupForKind("admin"),
      ]);
      if (cancelled) return;
      setBiometricAvailable(Boolean(bioAvail));
      setBiometricReady(Boolean(bioAvail && bioSaved));
      setPinReady(Boolean(pinSaved));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openPinLogin = () => {
    setPinError(null);
    setPinValue("");
    setPinMode("login");
    setShowPinModal(true);
  };

  const openPinSetup = () => {
    setPinError(null);
    setPinValue("");
    setPinMode("setup");
    setShowPinModal(true);
  };

  const closePinModal = () => {
    setShowPinModal(false);
    setPinMode(null);
    setPinValue("");
    setPinError(null);
  };

  const maybeOfferQuickLoginSetup = async (creds: { email: string; password: string }) => {
    const native = await isNativeCapacitor();
    if (!native) return;

    const optedOut = await userOptedOutOfQuickLoginPrompt();
    if (optedOut) return;

    if (!creds.email || !creds.password) return;

    const bioAvail = await isBiometricsAvailable();
    if (bioAvail) {
      const enableBio = window.confirm("Enable biometric login for faster sign in on this device?");
      if (enableBio) {
        try {
          await saveBiometricCredentials({ email: creds.email, password: creds.password, kind: "admin" });
          setBiometricReady(true);
        } catch (err: any) {
          console.warn("Biometric setup failed:", err?.message || err);
        }
      }
    }

    const enablePin = window.confirm("Set an app PIN for quick login on this device?");
    if (enablePin) {
      const pin = window.prompt("Enter a 4–8 digit app PIN (numbers only):") || "";
      try {
        await setPinCredentials({ pin, credentials: { email: creds.email, password: creds.password, kind: "admin" } });
        setPinReady(true);
      } catch (err: any) {
        console.warn("PIN setup failed:", err?.message || err);
      }
    }

    const dontAskAgain = window.confirm("Don't ask again about quick login on this device?");
    if (dontAskAgain) {
      await setUserOptedOutOfQuickLoginPrompt(true);
    }
  };

  const handleBiometricLogin = async () => {
    setError(null);
    setQuickLoading(true);
    try {
      const creds = await getBiometricCredentials("admin");
      const result = await signInAdmin({ email: creds.email, password: creds.password });
      if (result.requiresOtp && result.otpId) {
        setOtpRequired(true);
        setOtpId(result.otpId);
        setOtpMessage(result.message || "Enter the OTP sent to your email and phone.");
        return;
      }
      if (!result.success) throw new Error(result.message || "Login failed");
      router.push(result.redirect || "/admin/dashboard");
    } catch (err: any) {
      setError(err?.message || "Biometric login failed.");
    } finally {
      setQuickLoading(false);
    }
  };

  const handlePinContinue = async () => {
    setPinError(null);
    setError(null);
    setQuickLoading(true);
    try {
      if (pinMode === "login") {
        const creds = await getPinCredentials({ pin: pinValue, kind: "admin" });
        const result = await signInAdmin({ email: creds.email, password: creds.password });
        if (result.requiresOtp && result.otpId) {
          closePinModal();
          setOtpRequired(true);
          setOtpId(result.otpId);
          setOtpMessage(result.message || "Enter the OTP sent to your email and phone.");
          return;
        }
        if (!result.success) throw new Error(result.message || "Login failed");
        closePinModal();
        router.push(result.redirect || "/admin/dashboard");
        return;
      }

      if (pinMode === "setup") {
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !password) throw new Error("Enter your email and password first.");
        await setPinCredentials({ pin: pinValue, credentials: { email: trimmedEmail, password, kind: "admin" } });
        setPinReady(true);
        closePinModal();
        return;
      }
    } catch (err: any) {
      setPinError(err?.message || "PIN failed.");
    } finally {
      setQuickLoading(false);
    }
  };

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

      if (data.requiresOtp && data.otpId) {
        setOtpRequired(true);
        setOtpId(data.otpId);
        setOtpMessage(data.message || "Enter the OTP sent to your email and phone.");
        return;
      }

      if (data.success && data.userId && data.role) {
        Cookies.set("userId", data.userId, {
          expires: 7,
          secure: true,
          sameSite: "Strict",
        });
        Cookies.set("role", data.role, {
          expires: 7,
          secure: true,
          sameSite: "Strict",
        });
        await maybeOfferQuickLoginSetup({ email: email.trim(), password });
        router.push(data.redirect || "/admin/dashboard");
      } else {
        setError(data.message || "Invalid credentials");
      }
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    setIsLoading(true);

    try {
      if (!otpId) {
        throw new Error("OTP session expired. Please log in again.");
      }

      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otpId, code: otpCode }),
      });

      const data: LoginResponse = await res.json();

      if (!res.ok || !data.success || !data.userId || !data.role) {
        throw new Error(data.message || "OTP verification failed.");
      }

      Cookies.set("userId", data.userId, {
        expires: 7,
        secure: true,
        sameSite: "Strict",
      });
      Cookies.set("role", data.role, {
        expires: 7,
        secure: true,
        sameSite: "Strict",
      });

      await maybeOfferQuickLoginSetup({ email: email.trim(), password });
      router.push(data.redirect || "/admin/dashboard");
    } catch (err: any) {
      setError(err.message || "OTP verification failed.");
      autoVerifyRef.current = "";
    } finally {
      setIsLoading(false);
    }
  };

  const handleOtpVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    await verifyOtp();
  };

  useEffect(() => {
    if (!otpRequired) return;
    if (otpCode.length !== 6) return;
    if (isLoading) return;
    if (autoVerifyRef.current === otpCode) return;
    autoVerifyRef.current = otpCode;
    verifyOtp();
  }, [otpCode, otpRequired, isLoading]);

  useEffect(() => {
    if (!otpRequired) return;
    const timer = window.setTimeout(() => {
      otpInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      otpInputRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(timer);
  }, [otpRequired]);

  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setInterval(() => {
      setResendCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCountdown]);

  const handleResendOtp = async () => {
    if (!otpId || resendLoading || resendCountdown > 0) return;
    setResendLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/otp/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otpId }),
      });

      const data: LoginResponse & { retryAfterMs?: number } = await res.json();
      if (!res.ok) {
        const retryAfter = Math.ceil((data.retryAfterMs || 30000) / 1000);
        if (res.status === 429) {
          setResendCountdown(retryAfter);
        }
        throw new Error(data.message || "Failed to resend OTP.");
      }

      setOtpMessage(data.message || "OTP resent to your email and phone.");
      const retryAfter = Math.ceil((data.retryAfterMs || 30000) / 1000);
      setResendCountdown(retryAfter);
    } catch (err: any) {
      setError(err.message || "Failed to resend OTP.");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <PublicThemeWrapper>
      <div className="min-h-[100svh] lg:h-[100svh] flex flex-col lg:flex-row bg-background text-foreground lg:overflow-hidden">
        {/* LEFT: Branding – hidden on mobile */}
        <div className="hidden lg:flex lg:w-1/2 bg-background text-foreground items-center justify-center p-6 xl:p-12 relative overflow-hidden shadow-[-20px_0_30px_-15px_rgba(30,58,138,0.08)] lg:shadow-[-30px_0_40px_-20px_rgba(30,58,138,0.10)]">
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

          <div className="relative z-10 max-w-lg text-center space-y-4 xl:space-y-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }}>
              <Image
                src="/logo.png"
                alt="Sorana Admin Portal"
                width={400}
                height={140}
                className="mx-auto drop-shadow-xl max-w-[240px] sm:max-w-[280px] xl:max-w-[320px]"
                priority
              />
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.9 }}
              className="text-3xl sm:text-4xl xl:text-5xl font-extrabold tracking-tight text-gradient-primary"
            >
              Admin Control Center
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.9 }}
              className="text-sm sm:text-base xl:text-lg font-light text-muted-foreground leading-relaxed max-w-md mx-auto"
            >
              System oversight • User management • Property moderation • Analytics & configuration
            </motion.p>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.55 }}
              className="text-xs sm:text-sm xl:text-base font-medium text-primary tracking-wide"
            >
              Secure. Powerful. Administrative access only.
            </motion.p>
          </div>
        </div>

        {/* RIGHT: Form */}
        <div className="flex-1 flex items-start lg:items-center justify-center px-4 py-2 sm:py-4 md:py-6 bg-background/80">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="w-full max-w-md sm:max-w-lg bg-card/90 backdrop-blur-2xl rounded-2xl shadow-2xl border border-border overflow-hidden text-[0.9rem] sm:text-[0.95rem] max-h-[90svh] flex flex-col"
          >
            {/* Mobile logo */}
            <div className="lg:hidden flex justify-center pt-4 pb-3">
              <Image
                src="/logo.png"
                alt="Sorana"
                width={240}
                height={80}
                className="drop-shadow-lg max-w-[160px] xs:max-w-[180px]"
                priority
              />
            </div>

            <div className="px-4 xs:px-6 sm:px-8 md:px-10 pt-2 sm:pt-3 pb-3 sm:pb-4 space-y-2 sm:space-y-2.5 flex-1 min-h-0 overflow-y-auto">
              <div className="text-center space-y-1">
                <h1 className="text-lg xs:text-xl sm:text-2xl md:text-2.5xl font-extrabold text-gradient-primary">
                  Admin Portal Login
                </h1>
                <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">
                  Restricted access for administrators
                </p>
              </div>

              {error && (
                <div className="p-2.5 xs:p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl text-center">
                  {error}
                </div>
              )}

              {otpRequired ? (
                <form onSubmit={handleOtpVerify} className="space-y-3 sm:space-y-3.5 pt-1">
                  {otpMessage && (
                    <div className="p-2.5 xs:p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs sm:text-sm rounded-xl text-center">
                      {otpMessage}
                    </div>
                  )}
                  <input
                    ref={otpInputRef}
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Enter 6-digit OTP"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    autoComplete="one-time-code"
                    className="w-full px-3.5 xs:px-4 py-2.5 bg-background/80 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner tracking-[0.35em] text-center"
                  />

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={isLoading || otpCode.length < 6}
                    className="w-full bg-[linear-gradient(110deg,#42c775,#34b46d)] hover:bg-[linear-gradient(110deg,#34b46d,#42c775)] text-primary-foreground font-semibold py-2.5 xs:py-3 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-xs xs:text-sm sm:text-base tracking-wide"
                  >
                    {isLoading ? "Verifying..." : "Verify OTP"}
                  </motion.button>

                  <button
                    type="button"
                    onClick={() => {
                      setOtpRequired(false);
                      setOtpId(null);
                      setOtpCode("");
                      setOtpMessage(null);
                      setResendCountdown(0);
                      autoVerifyRef.current = "";
                    }}
                    className="w-full text-xs sm:text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    Back to login
                  </button>

                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendLoading || resendCountdown > 0}
                    className="w-full text-xs sm:text-sm text-muted-foreground hover:text-primary transition-colors disabled:opacity-60"
                  >
                    {resendLoading
                      ? "Resending OTP..."
                      : resendCountdown > 0
                        ? `Resend OTP in ${resendCountdown}s`
                        : "Resend OTP"}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-3.5 pt-1">
                  {(biometricReady || pinReady) && (
                    <div className="space-y-2">
                      {biometricReady && (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          type="button"
                          disabled={quickLoading || isLoading}
                          onClick={handleBiometricLogin}
                          className="w-full bg-[linear-gradient(110deg,#1e3a8a,#2c5bd6)] hover:bg-[linear-gradient(110deg,#2c5bd6,#1e3a8a)] text-primary-foreground font-semibold py-2.5 xs:py-3 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-xs xs:text-sm sm:text-base tracking-wide"
                        >
                          {quickLoading ? "Opening…" : "Sign in with Biometrics"}
                        </motion.button>
                      )}
                      {pinReady && (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          type="button"
                          disabled={quickLoading || isLoading}
                          onClick={openPinLogin}
                          className="w-full border border-border bg-background/70 hover:bg-background text-foreground font-semibold py-2.5 xs:py-3 rounded-xl transition-all duration-300 shadow-sm disabled:opacity-60 disabled:cursor-not-allowed text-xs xs:text-sm sm:text-base tracking-wide"
                        >
                          Use PIN
                        </motion.button>
                      )}
                    </div>
                  )}
                  <div>
                    <input
                      type="email"
                      placeholder="Admin email address"
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
                      className={`w-full px-3.5 xs:px-4 py-2.5 bg-background/80 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner ${
                        formErrors.email ? "border-red-400" : "border-border"
                      }`}
                    />
                    {formErrors.email && (
                      <p className="mt-1.5 text-[10px] sm:text-[11px] text-red-600">{formErrors.email}</p>
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
                      className={`w-full px-3.5 xs:px-4 py-2.5 pr-9 xs:pr-10 bg-background/80 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner ${
                        formErrors.password ? "border-red-400" : "border-border"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-2.5 xs:right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                    >
                      {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                    </button>
                    {formErrors.password && (
                      <p className="mt-1.5 text-[10px] sm:text-[11px] text-red-600">{formErrors.password}</p>
                    )}
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={isLoading || !!formErrors.email || !!formErrors.password}
                    className={`w-full bg-[linear-gradient(110deg,#42c775,#34b46d)] hover:bg-[linear-gradient(110deg,#34b46d,#42c775)] text-primary-foreground font-semibold py-2.5 xs:py-3 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-xs xs:text-sm sm:text-base tracking-wide ${
                      isLoading || formErrors.email || formErrors.password ? "pointer-events-none" : ""
                    }`}
                  >
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-3">
                        <span className="relative h-1.5 w-16 overflow-hidden rounded-full bg-white/30">
                          <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/80 to-transparent animate-admin-login-shimmer" />
                        </span>
                        <span className="tracking-wide">Authenticating</span>
                      </span>
                    ) : (
                      "Sign In"
                    )}
                  </motion.button>

                  {biometricAvailable && !biometricReady && (
                    <button
                      type="button"
                      onClick={async () => {
                        setError(null);
                        try {
                          const trimmedEmail = email.trim();
                          if (!trimmedEmail || !password) throw new Error("Enter your email and password first.");
                          await saveBiometricCredentials({ email: trimmedEmail, password, kind: "admin" });
                          setBiometricReady(true);
                        } catch (err: any) {
                          setError(err?.message || "Failed to enable biometrics.");
                        }
                      }}
                      className="w-full text-[11px] sm:text-[11px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      Enable biometric login on this device
                    </button>
                  )}

                  {pinReady === false && (
                    <button
                      type="button"
                      onClick={openPinSetup}
                      className="w-full text-[11px] sm:text-[11px] text-muted-foreground hover:text-primary transition-colors"
                    >
                      Set up PIN login on this device
                    </button>
                  )}
                </form>
              )}
            </div>
          </motion.div>
        </div>
      </div>
      <style jsx global>{`
        @keyframes admin-login-shimmer {
          0% {
            transform: translateX(-120%);
          }
          100% {
            transform: translateX(120%);
          }
        }
        .animate-admin-login-shimmer {
          animation: admin-login-shimmer 1.4s ease-in-out infinite;
        }
      `}</style>

      <AnimatePresence>
        {showPinModal && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop px-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ duration: 0.25 }}
              className="modal-panel w-full max-w-[92vw] sm:max-w-md overflow-hidden"
            >
              <div className="modal-header flex items-center justify-between px-4 sm:px-5 py-3">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-foreground">
                    {pinMode === "setup" ? "Set App PIN" : "Enter PIN"}
                  </h2>
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    {pinMode === "setup"
                      ? "Use this PIN to quickly sign in on this device."
                      : "Use your app PIN to sign in."}
                  </p>
                </div>
                <button type="button" onClick={closePinModal} className="modal-close rounded-full p-1" aria-label="Close PIN modal">
                  <FaTimes />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handlePinContinue();
                }}
                className="modal-body modal-stagger space-y-3 sm:space-y-4"
              >
                {pinError && (
                  <div className="p-2.5 sm:p-3 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl">
                    {pinError}
                  </div>
                )}
                <input
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="4+ digit PIN"
                  value={pinValue}
                  onChange={(e) => setPinValue(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  autoComplete="off"
                  className="w-full px-3.5 xs:px-4 py-2.5 bg-background/80 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner tracking-[0.25em] text-center"
                />
                <button
                  type="submit"
                  disabled={quickLoading || pinValue.length < 4}
                  className="w-full bg-[linear-gradient(110deg,#1e3a8a,#2c5bd6)] hover:bg-[linear-gradient(110deg,#2c5bd6,#1e3a8a)] text-primary-foreground font-semibold py-2.5 xs:py-3 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-xs xs:text-sm sm:text-base tracking-wide"
                >
                  {quickLoading ? "Working…" : pinMode === "setup" ? "Save PIN" : "Continue"}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PublicThemeWrapper>
  );
}
