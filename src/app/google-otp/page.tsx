"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import OtpCodeField from "@/components/auth/OtpCodeField";
import { useAndroidSmsRetriever } from "@/lib/android-sms-retriever";
import { useOtpAutoVerify } from "@/lib/use-otp-auto-verify";
import { AuthLoadingFallback } from "@/components/ui/LoadingSkeletons";

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
  useAndroidSmsRetriever({ enabled: true, onCode: setCode });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submitOtp = useCallback(async (submittedCode: string) => {
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
        body: JSON.stringify({ otpId, code: submittedCode }),
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
    } finally {
      setLoading(false);
    }
  }, [otpId, returnTo, router]);

  const verifyOtp = useOtpAutoVerify({
    code,
    enabled: !loading,
    onVerify: submitOtp,
  });

  const handleVerify = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      return void verifyOtp(code, true);
    },
    [code, verifyOtp]
  );

  return (
    <PublicThemeWrapper>
      <div className="min-h-[100dvh] flex items-center justify-center overflow-y-auto bg-background px-4 py-6 text-foreground sm:py-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        className="my-auto w-full max-w-md rounded-3xl border border-border bg-card/95 p-6 shadow-2xl backdrop-blur-xl sm:p-8"
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
              <div className="auth-status-error rounded-xl border px-4 py-3 text-sm">
                {error}
              </div>
            )}
            {message && (
              <div className="auth-status-success rounded-xl border px-4 py-3 text-sm">
                {message}
              </div>
            )}

            <OtpCodeField
              inputRef={inputRef}
              value={code}
              onChange={setCode}
              placeholder="123456"
              disabled={loading}
              helperText="Your phone can autofill the code automatically."
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
    <Suspense fallback={<div className="min-h-[100svh] grid place-items-center p-4"><AuthLoadingFallback /></div>}>
      <GoogleOtpContent />
    </Suspense>
  );
}
