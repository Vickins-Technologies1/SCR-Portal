// src/app/reset-password/page.tsx
"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Lock, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token || !email) {
      setError("Invalid or missing reset link. Please request a new one.");
    }
  }, [token, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/tenant/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, newPassword: password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Failed to reset password");
      }

      setSuccess(true);
      setMessage("Your password has been successfully reset. You can now log in.");
    } catch (err: any) {
      setError(err.message || "Something went wrong. The link may have expired or is invalid.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 px-4 py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-sm sm:max-w-md bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-100/50 overflow-hidden"
        >
          <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600" />

          <div className="p-6 sm:p-10 text-center">
            <div className="mx-auto w-16 h-16 sm:w-20 sm:h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
              <CheckCircle2 className="h-8 w-8 sm:h-12 sm:w-12 text-emerald-600" />
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-4">
              Password Reset Successful
            </h1>
            <p className="text-gray-600 text-sm sm:text-base mb-8 px-2">{message}</p>

            <Link
              href="/login"
              className="inline-flex items-center justify-center px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-medium rounded-2xl shadow-lg hover:shadow-xl hover:from-emerald-700 hover:to-teal-700 transition-all transform hover:-translate-y-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 text-sm sm:text-base"
            >
              Go to Login
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-gray-100 py-8 px-4 sm:px-6 lg:px-8">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
        className="w-full max-w-sm sm:max-w-md lg:max-w-lg bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-gray-100/50 overflow-hidden"
      >
        {/* Premium header gradient */}
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600" />

        <div className="p-6 sm:p-8 lg:p-10">
          <div className="flex justify-center mb-6 sm:mb-8">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-emerald-100 rounded-2xl flex items-center justify-center shadow-md">
              <Lock className="h-7 w-7 sm:h-8 sm:w-8 text-emerald-600" />
            </div>
          </div>

          <h2 className="text-center text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Reset Your Password
          </h2>
          <p className="text-center text-gray-600 text-sm sm:text-base mb-6 sm:mb-10 px-2">
            {email ? `for ${email}` : "Secure your account"}
          </p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 sm:px-5 sm:py-4 rounded-2xl flex items-center gap-3 shadow-sm text-sm sm:text-base"
            >
              <AlertCircle className="h-5 w-5 flex-shrink-0" />
              <span className="break-words">{error}</span>
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 sm:space-y-6">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                New Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                disabled={loading}
                className="block w-full px-4 sm:px-5 py-3 sm:py-4 border border-gray-300 rounded-2xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white/70 backdrop-blur-sm disabled:opacity-60 disabled:cursor-not-allowed text-sm sm:text-base"
                placeholder="••••••••"
              />
            </div>

            <div>
              <label htmlFor="confirm" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                id="confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                className="block w-full px-4 sm:px-5 py-3 sm:py-4 border border-gray-300 rounded-2xl shadow-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all bg-white/70 backdrop-blur-sm disabled:opacity-60 disabled:cursor-not-allowed text-sm sm:text-base"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !token || !email}
              className={`w-full py-3.5 sm:py-4 px-6 text-white font-medium rounded-2xl shadow-lg transition-all transform focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 text-sm sm:text-base ${
                loading || !token || !email
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 hover:shadow-xl hover:-translate-y-1"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center">
                  <svg className="animate-spin h-5 w-5 mr-3 text-white" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Resetting...
                </span>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>

          <div className="mt-6 sm:mt-8 text-center">
            <Link
              href="/"
              className="inline-flex items-center text-sm sm:text-base text-emerald-600 hover:text-emerald-800 transition-colors"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              Back to Login
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
 
// Wrap in Suspense (required for useSearchParams)
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600 text-lg animate-pulse">Loading reset page...</div>
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}