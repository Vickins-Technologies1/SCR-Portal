"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaGoogle, FaArrowRight, FaUserTie, FaInfoCircle, FaTimes } from "react-icons/fa";
import Cookies from "js-cookie";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import OtpCodeField from "@/components/auth/OtpCodeField";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import { useAndroidSmsRetriever } from "@/lib/android-sms-retriever";
import { buildGoogleAuthStartUrl } from "@/lib/google-auth-client";
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
import { signInOwner } from "@/lib/signin-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [otpRequired, setOtpRequired] = useState(false);
  const [otpId, setOtpId] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [otpMessage, setOtpMessage] = useState<string | null>(null);
  const otpInputRef = useRef<HTMLInputElement | null>(null);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(0);
  const autoVerifyRef = useRef<string>("");
  const [showResetModal, setShowResetModal] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [pinReady, setPinReady] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinValue, setPinValue] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinMode, setPinMode] = useState<"login" | "setup" | null>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const router = useRouter();
  const { appHash } = useAndroidSmsRetriever({ enabled: true, onCode: setOtpCode });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const native = await isNativeCapacitor();
      if (!native || cancelled) return;

      const [bioAvail, bioSaved, pinSaved] = await Promise.all([
        isBiometricsAvailable(),
        hasBiometricCredentials("owner"),
        hasPinSetupForKind("owner"),
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

    // Only prompt when user actually entered a password.
    if (!creds.email || !creds.password) return;

    const bioAvail = await isBiometricsAvailable();
    if (bioAvail) {
      const enableBio = window.confirm("Enable biometric login for faster sign in on this device?");
      if (enableBio) {
        try {
          await saveBiometricCredentials({ email: creds.email, password: creds.password, kind: "owner" });
          setBiometricReady(true);
        } catch (err: any) {
          // ignore; user can still use normal login
          console.warn("Biometric setup failed:", err?.message || err);
        }
      }
    }

    const enablePin = window.confirm("Set an app PIN for quick login on this device?");
    if (enablePin) {
      const pin = window.prompt("Enter a 4–8 digit app PIN (numbers only):") || "";
      try {
        await setPinCredentials({ pin, credentials: { email: creds.email, password: creds.password, kind: "owner" } });
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
      const creds = await getBiometricCredentials("owner");
      const result = await signInOwner({ email: creds.email, password: creds.password, appHash });
      if (result.requiresOtp && result.otpId) {
        setOtpRequired(true);
        setOtpId(result.otpId);
        setOtpMessage(result.message || "Enter the OTP sent to your email and phone.");
        return;
      }
      if (!result.success) throw new Error(result.message || "Login failed");
      const fallback =
        Cookies.get("managementType") === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard";
      router.push(result.redirect || fallback);
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
        const creds = await getPinCredentials({ pin: pinValue, kind: "owner" });
        const result = await signInOwner({ email: creds.email, password: creds.password, appHash });
        if (result.requiresOtp && result.otpId) {
          closePinModal();
          setOtpRequired(true);
          setOtpId(result.otpId);
          setOtpMessage(result.message || "Enter the OTP sent to your email and phone.");
          return;
        }
        if (!result.success) throw new Error(result.message || "Login failed");
        closePinModal();
        const fallback =
          Cookies.get("managementType") === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard";
        router.push(result.redirect || fallback);
        return;
      }

      if (pinMode === "setup") {
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !password) throw new Error("Enter your email or phone number and password first.");
        await setPinCredentials({ pin: pinValue, credentials: { email: trimmedEmail, password, kind: "owner" } });
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

  const handleGoogleLogin = async () => {
    if (isLoading) return;
    try {
      window.location.href = await buildGoogleAuthStartUrl({
        portal: "owner",
        action: "login",
        appHash,
      });
    } catch {
      setError("Unable to start Google sign-in.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, appHash }), // Removed role from payload
        credentials: "include",
      });

      const data = await res.json();

      if (data?.requiresOtp && data?.otpId) {
        setOtpRequired(true);
        setOtpId(data.otpId);
        setOtpMessage(data.message || "Enter the OTP sent to your email and phone.");
        return;
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Login failed");
      }

      Cookies.set("userId", data.userId, {
        secure: true,
        sameSite: "Strict",
        expires: 7,
      });

      Cookies.set("role", data.role, {
        secure: true,
        sameSite: "Strict",
        expires: 7,
      });

      // Optional: store permissions if your backend returns them
      if (data.permissions) {
        Cookies.set("permissions", JSON.stringify(data.permissions), {
          secure: true,
          sameSite: "Strict",
          expires: 7,
        });
      }

      const fallback =
        Cookies.get("managementType") === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard";
      await maybeOfferQuickLoginSetup({ email: email.trim(), password });
      router.push(data.redirect || fallback);
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please check your credentials.");
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

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "OTP verification failed");
      }

      Cookies.set("userId", data.userId, {
        secure: true,
        sameSite: "Strict",
        expires: 7,
      });

      Cookies.set("role", data.role, {
        secure: true,
        sameSite: "Strict",
        expires: 7,
      });

      if (data.permissions) {
        Cookies.set("permissions", JSON.stringify(data.permissions), {
          secure: true,
          sameSite: "Strict",
          expires: 7,
        });
      }

      const fallback =
        Cookies.get("managementType") === "airbnb" ? "/airbnb-dashboard" : "/property-owner-dashboard";
      await maybeOfferQuickLoginSetup({ email: email.trim(), password });
      router.push(data.redirect || fallback);
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

      const data = await res.json();
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

  const fetchCsrfToken = async () => {
    try {
      const res = await fetch("/api/csrf-token", { credentials: "include" });
      const data = await res.json();
      if (res.ok && data.csrfToken) {
        setCsrfToken(data.csrfToken);
        return data.csrfToken as string;
      }
    } catch (err) {
      console.error("Failed to fetch CSRF token:", err);
    }
    return null;
  };

  const openResetModal = async () => {
    setResetEmail((prev) => prev || email);
    setResetError(null);
    setResetMessage(null);
    setShowResetModal(true);
    if (!csrfToken) {
      await fetchCsrfToken();
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    setResetMessage(null);
    setResetLoading(true);

    try {
      let token = csrfToken;
      if (!token) {
        token = await fetchCsrfToken();
      }

      if (!token) {
        throw new Error("Unable to start reset. Please try again.");
      }

      const res = await fetch("/api/owner/reset-password-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": token,
        },
        credentials: "include",
        body: JSON.stringify({ email: resetEmail }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to send reset link");
      }

      setResetMessage(
        data.message || "If this email is registered, a reset link has been sent."
      );
    } catch (err: any) {
      setResetError(err.message || "Failed to send reset link. Please try again.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <PublicThemeWrapper>
      <div className="min-h-[100svh] flex flex-col lg:flex-row bg-background text-foreground">
      {/* LEFT: Branding – hidden on mobile */}
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
            Property Intelligence
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.9 }}
            className="text-sm sm:text-base xl:text-lg font-light text-muted-foreground leading-relaxed max-w-md mx-auto"
          >
            Real-time analytics • ROI tracking • Predictive vacancy insights
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="text-xs sm:text-sm xl:text-base font-medium text-primary tracking-wide"
          >
            See clearer. Decide smarter. Earn more.
          </motion.p>
        </div>
      </div>

      {/* RIGHT: Form */}
      <div className="flex-1 flex items-start lg:items-center justify-center px-4 py-3 sm:py-6 md:py-8 bg-background/80">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="w-full max-w-md sm:max-w-lg bg-card/90 backdrop-blur-2xl rounded-2xl shadow-2xl border border-border overflow-hidden text-[0.9rem] sm:text-[0.95rem] max-h-[90svh] flex flex-col"
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

          <div className="px-4 xs:px-6 sm:px-8 md:px-10 pt-3 sm:pt-4 pb-4 sm:pb-5 space-y-2.5 sm:space-y-3 flex-1 min-h-0 overflow-y-auto">

            <div className="text-center space-y-1">
              <h1 className="text-lg xs:text-xl sm:text-2xl md:text-2.5xl font-extrabold text-gradient-primary">
                Owner Portal Login
              </h1>

              <p className="text-[10px] sm:text-[11px] text-muted-foreground font-medium">
                Secure access for property owners
              </p>
            </div>
            {/* Tenant Portal Button */}
            <div className="relative group">
              <Link
                href="/tenant-login"
                className="flex items-center justify-center gap-2 w-full bg-[linear-gradient(110deg,rgba(66,199,117,0.18),rgba(30,58,138,0.08))] hover:bg-[linear-gradient(110deg,rgba(66,199,117,0.24),rgba(30,58,138,0.12))] border border-border hover:border-primary/50 text-foreground font-semibold py-2.5 xs:py-3 px-4 xs:px-5 rounded-xl transition-all duration-300 shadow-sm hover:shadow active:scale-[0.98] text-xs xs:text-sm sm:text-base"
              >
                <FaUserTie className="text-primary text-lg" />
                <span>I&apos;m a Tenant</span>
                <FaArrowRight className="text-primary opacity-70 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
              </Link>

              {/* Info icon – now also focusable */}
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                <div
                  tabIndex={0}
                  className="relative flex items-center justify-center w-5 h-5 xs:w-6 xs:h-6 cursor-help outline-none focus:ring-2 focus:ring-primary/50 rounded-full"
                >
                  <FaInfoCircle className="text-primary/70 hover:text-primary text-base xs:text-lg transition-colors" />

                  {/* Tooltip – shows on group-hover OR when icon is focused */}
                  <div
                    className="
                      absolute bottom-full right-0 mb-2 z-20 w-max max-w-[220px]
                      opacity-0 translate-y-1 scale-95
                      transition-all duration-200
                      pointer-events-none
                      group-hover:opacity-100 group-hover:translate-y-0 group-hover:scale-100
                      group-focus-within:opacity-100 group-focus-within:translate-y-0 group-focus-within:scale-100
                      group-active:opacity-100 group-active:translate-y-0 group-active:scale-100
                    "
                  >
                    <div className="bg-white text-foreground text-xs rounded-lg py-1.5 px-2.5 shadow-lg border border-border leading-snug">
                      For tenants currently renting a property
                      <br />
                      <span className="text-foreground/70">View lease, payments & maintenance requests</span>
                    </div>
                    <div className="absolute bottom-[-6px] right-3 w-0 h-0 border-l-5 border-l-transparent border-r-5 border-r-transparent border-t-5 border-t-white drop-shadow" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] sm:text-xs text-muted-foreground">
              <Link href="/airbnb-tenant-login" className="hover:text-primary hover:underline">
                Guest payment
              </Link>
              <span aria-hidden className="opacity-40">
                •
              </span>
              <Link href="/admin/login" className="hover:text-primary hover:underline">
                Admin
              </Link>
              <span aria-hidden className="opacity-40">
                •
              </span>
              <Link href="/portals" className="hover:text-primary hover:underline">
                All portals
              </Link>
            </div>
            {error && (
              <div className="p-2.5 xs:p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl text-center">
                {error}
              </div>
            )}


            {!otpRequired ? (
              <>
                <div className="relative my-1 sm:my-2">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="bg-background/80 px-3 xs:px-4 text-muted-foreground font-medium">or</span>
                  </div>
                </div>

                {/* Google Sign In */}
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
              </>
            ) : null}

            {otpRequired ? (
              <form onSubmit={handleOtpVerify} className="space-y-3.5 sm:space-y-4 pt-1">
                {otpMessage && (
                  <div className="p-2.5 xs:p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs sm:text-sm rounded-xl text-center">
                    {otpMessage}
                  </div>
                )}

                <OtpCodeField
                  inputRef={otpInputRef}
                  value={otpCode}
                  onChange={setOtpCode}
                  placeholder="Enter 6-digit OTP"
                  disabled={isLoading}
                  helperText="Your phone can autofill the code automatically."
                  inputClassName="bg-background/80 px-3.5 xs:px-4 py-2.5 text-xs xs:text-sm sm:text-base"
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
              <form id="login-form" onSubmit={handleSubmit} className="space-y-3.5 sm:space-y-4 pt-1">
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
                <input
                  type="text"
                  placeholder="Email or phone number"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className="w-full px-3.5 xs:px-4 py-2.5 bg-background/80 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner"
                />

                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="w-full px-3.5 xs:px-4 py-2.5 pr-9 xs:pr-10 bg-background/80 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 xs:right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                  </button>
                </div>

                <div className="flex items-center justify-end text-xs sm:text-sm">
                  <button
                    type="button"
                    onClick={openResetModal}
                    className="text-primary font-semibold hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-[linear-gradient(110deg,#42c775,#34b46d)] hover:bg-[linear-gradient(110deg,#34b46d,#42c775)] text-primary-foreground font-semibold py-2.5 xs:py-3 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-xs xs:text-sm sm:text-base tracking-wide"
                >
                  {isLoading ? "Authenticating..." : "Sign In"}
                </motion.button>

                {biometricAvailable && !biometricReady && (
                  <button
                    type="button"
                    onClick={async () => {
                      setError(null);
                      try {
                        const trimmedEmail = email.trim();
                        if (!trimmedEmail || !password) throw new Error("Enter your email or phone number and password first.");
                        await saveBiometricCredentials({ email: trimmedEmail, password, kind: "owner" });
                        setBiometricReady(true);
                      } catch (err: any) {
                        setError(err?.message || "Failed to enable biometrics.");
                      }
                    }}
                    className="w-full text-[11px] sm:text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Enable biometric login on this device
                  </button>
                )}

                {pinReady === false && (
                  <button
                    type="button"
                    onClick={openPinSetup}
                    className="w-full text-[11px] sm:text-xs text-muted-foreground hover:text-primary transition-colors"
                  >
                    Set up PIN login on this device
                  </button>
                )}
              </form>
            )}

            <p className="text-center text-[10px] sm:text-[11px] text-muted-foreground pt-1">
              New to Sorana?{" "}
              <Link href="/sign-up" className="text-primary font-semibold hover:underline">
                Create account
              </Link>
            </p>
          </div>

        </motion.div>
      </div>
    </div>

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
      {showResetModal && (
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
                <h2 className="text-sm sm:text-base font-bold text-foreground">Reset Owner Password</h2>
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  We’ll email you a secure reset link.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="modal-close rounded-full p-1"
                aria-label="Close reset modal"
              >
                <FaTimes />
              </button>
            </div>

            <form onSubmit={handleResetRequest} className="modal-body modal-stagger space-y-3 sm:space-y-4">
              {resetError && (
                <div className="p-2.5 sm:p-3 bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm rounded-xl">
                  {resetError}
                </div>
              )}
              {resetMessage && (
                <div className="p-2.5 sm:p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs sm:text-sm rounded-xl">
                  {resetMessage}
                </div>
              )}

              <input
                type="email"
                placeholder="Owner email address"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-3.5 xs:px-4 py-2.5 bg-background/80 border border-border rounded-xl focus:border-primary focus:ring-2 focus:ring-primary/30 transition-all placeholder:text-muted-foreground text-xs xs:text-sm sm:text-base shadow-inner"
              />

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full bg-[linear-gradient(110deg,#1e3a8a,#2c5bd6)] hover:bg-[linear-gradient(110deg,#2c5bd6,#1e3a8a)] text-primary-foreground font-semibold py-2.5 xs:py-3 rounded-xl transition-all duration-300 shadow-lg disabled:opacity-60 disabled:cursor-not-allowed text-xs xs:text-sm sm:text-base tracking-wide"
              >
                {resetLoading ? "Sending..." : "Send Reset Link"}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </PublicThemeWrapper>
  );
}
