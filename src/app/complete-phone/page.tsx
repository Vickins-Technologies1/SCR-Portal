"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";

function CompletePhoneContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) {
      setError("Your phone setup session has expired. Please start Google sign-in again.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/google/complete-phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, phone }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.message || "Unable to save your phone number.");
      }

      setMessage(data.message || "Phone number saved successfully.");

      const redirect = typeof data.redirect === "string" ? data.redirect : "";
      if (redirect) {
        router.replace(redirect);
      }
    } catch (err: any) {
      setError(err?.message || "Unable to save your phone number.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PublicThemeWrapper>
      <div className="min-h-[100svh] flex items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(66,199,117,0.18),_transparent_45%),linear-gradient(180deg,#f8fafc,white)] px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-md rounded-3xl border border-border bg-card/95 p-6 sm:p-8 shadow-2xl backdrop-blur-xl"
        >
          <div className="text-center space-y-2">
            <p className="text-xs uppercase tracking-[0.35em] text-primary font-semibold">Google Setup</p>
            <h1 className="text-2xl font-extrabold text-foreground">Add your phone number</h1>
            <p className="text-sm text-muted-foreground">
              We need a phone number to finish your account and keep sign-in secure.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
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

            <label className="block space-y-1">
              <span className="text-sm font-semibold text-foreground">Phone number</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254712345678"
                autoComplete="tel"
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm shadow-inner focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </label>

            <button
              type="submit"
              disabled={loading || !phone.trim()}
              className="w-full rounded-xl bg-[linear-gradient(110deg,#42c775,#34b46d)] px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Saving..." : "Continue"}
            </button>
          </form>
        </motion.div>
      </div>
    </PublicThemeWrapper>
  );
}

export default function CompletePhonePage() {
  return (
    <Suspense fallback={<div className="min-h-[100svh] grid place-items-center">Loading...</div>}>
      <CompletePhoneContent />
    </Suspense>
  );
}

