"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import OtpCodeField from "@/components/auth/OtpCodeField";
import { useAndroidSmsRetriever } from "@/lib/android-sms-retriever";

function GoogleOtpContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const otpId = useMemo(() => searchParams.get("otpId") || "", [searchParams]);
  const returnTo = useMemo(() => searchParams.get("returnTo") || "", [searchParams]);
  const role = useMemo(() => searchParams.get("role") || "propertyOwner", [searchParams]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const autoVerifyRef = useRef<string>("");
  useAndroidSmsRetriever({ enabled: true, onCode: setCode });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submitOtp = useCallback(async () => {
    setError(null);
    setMessage(null);

    if (!otpId) {
      setError("Your OTP session expired. Please start Google sign-in again.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ otpId, code }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.message || "OTP verification failed.");
      }

      const redirect = typeof data.redirect === "string" && data.redirect ? data.redirect : returnTo || "";
      setMessage("OTP verified successfully.");
      if (redirect) {
        router.replace(redirect);
      }
    } catch (err: any) {
      setError(err?.message || "OTP verification failed.");
      autoVerifyRef.current = "";
    } finally {
      setLoading(false);
    }
  }, [code, otpId, returnTo, router]);

  const handleVerify = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      return void submitOtp();
    },
    [submitOtp]
  );

  useEffect(() => {
    if (loading) return;
    if (code.length !== 6) return;
    if (autoVerifyRef.current === code) return;
    autoVerifyRef.current = code;
    void submitOtp();
  }, [code, loading, submitOtp]);

  return (
    <PublicThemeWrapper>
      <div className="min-h-[100svh] flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(30,58,138,0.18),_transparent_45%),linear-gradient(180deg,#f8fafc,white)] px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md rounded-3xl border border-border bg-card/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl"
        >
          <div className="text-center space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-primary font-semibold">Google Login</p>
            <h1 className="text-2xl font-extrabold text-foreground">Enter your OTP</h1>
            <p className="text-sm text-muted-foreground">
              We sent a one-time code to your email and phone before logging you into the {role} portal.
            </p>
          </div>

          <form onSubmit={handleVerify} className="mt-6 space-y-4">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {message && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {message}
              </div>
            )}

            <OtpCodeField
              inputRef={inputRef}
              value={code}
              onChange={setCode}
              placeholder="123456"
              disabled={loading}
              helperText="Paste the code from SMS or email, or let your phone autofill it automatically."
            />

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full rounded-xl bg-[linear-gradient(110deg,#42c775,#34b46d)] px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Verifying..." : "Verify OTP"}
            </button>

            {returnTo && (
              <button
                type="button"
                onClick={() => router.replace(returnTo)}
                className="w-full text-sm font-semibold text-muted-foreground hover:text-primary"
              >
                Back to portal
              </button>
            )}
          </form>
        </motion.div>
      </div>
    </PublicThemeWrapper>
  );
}

export default function GoogleOtpPage() {
  return (
    <Suspense fallback={<div className="min-h-[100svh] grid place-items-center">Loading...</div>}>
      <GoogleOtpContent />
    </Suspense>
  );
}
