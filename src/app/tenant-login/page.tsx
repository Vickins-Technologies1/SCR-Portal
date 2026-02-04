// app/tenant-login/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaGoogle } from "react-icons/fa";
import Cookies from "js-cookie";
import { motion } from "framer-motion";

export default function TenantLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [properties, setProperties] = useState<
    { id: string; name: string; address?: string }[]
  >([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Fetch available properties
  useEffect(() => {
    let mounted = true;

    async function loadProperties() {
      try {
        const res = await fetch("/api/public/properties", {
          cache: "no-store", // important for fresh list during development
        });

        if (!res.ok) throw new Error("Failed to load properties");

        const data = await res.json();

        if (data.success && mounted) {
          setProperties(data.properties || []);
        } else if (mounted) {
          setError("Unable to load property list. Please try again.");
        }
      } catch (err) {
        if (mounted) {
          setError("Connection issue. Please check your internet.");
        }
      } finally {
        if (mounted) setLoadingProperties(false);
      }
    }

    loadProperties();

    return () => {
      mounted = false;
    };
  }, []);

  // Auto-fill demo credentials
  useEffect(() => {
    const demo = searchParams.get("demo");
    if (demo === "tenant" && properties.length > 0) {
      setEmail("tenant@demo.com");
      setPassword("Tenant@2025!");
      // For demo: pick first property (in real app you might use a known demo property ID)
      setPropertyId(properties[0]?.id || "");
    }
  }, [searchParams, properties]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!propertyId) {
      setError("Please select your property");
      return;
    }

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    if (!password) {
      setError("Password is required");
      return;
    }

    setIsSubmitting(true);

    const payload = {
      email: email.trim(),
      password,
      role: "tenant",
      propertyId,
    };

    try {
      const response = await fetch("/api/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(
          result.message ||
            "Login failed. Please check your credentials and selected property."
        );
      }

      // Store tokens / session info
      Cookies.set("userId", result.userId, {
        expires: 7,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      Cookies.set("role", result.role, {
        expires: 7,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      });

      // Redirect to tenant dashboard
      router.push(result.redirect || "/tenant-dashboard");
    } catch (err: any) {
      setError(err.message || "An error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left side - Branding / Illustration */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-950 via-blue-950 to-teal-950 text-white items-center justify-center p-8 xl:p-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative z-10 text-center max-w-xl space-y-8">
          <Image
            src="/logo.png"
            alt="Sorana Property Managers"
            width={360}
            height={130}
            className="mx-auto drop-shadow-2xl"
            priority
          />
          <h1 className="text-5xl xl:text-6xl font-black tracking-tight bg-gradient-to-r from-teal-300 via-cyan-200 to-blue-200 bg-clip-text text-transparent">
            Tenant Portal
          </h1>
          <p className="text-xl xl:text-2xl font-light opacity-90">
            Pay rent • Report issues • View statements • Communicate with your landlord
          </p>
          <p className="text-lg font-medium text-teal-200/90 pt-4">
            Simple. Secure. Always up to date.
          </p>
        </div>
      </div>

      {/* Right side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-8 lg:p-12 bg-gray-50/60">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden"
        >
          <div className="p-8 sm:p-10">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold text-gray-800">Welcome back</h2>
              <p className="text-gray-600 mt-2">Sign in to access your tenant portal</p>
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-center text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Property selection */}
              <div>
                <label
                  htmlFor="property"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Your Property
                </label>
                {loadingProperties ? (
                  <div className="w-full px-4 py-3.5 bg-gray-100 text-gray-500 rounded-xl border border-gray-200">
                    Loading properties...
                  </div>
                ) : properties.length === 0 ? (
                  <div className="w-full px-4 py-3.5 bg-yellow-50 text-yellow-800 rounded-xl border border-yellow-200 text-sm">
                    No properties available. Please contact support.
                  </div>
                ) : (
                  <select
                    id="property"
                    value={propertyId}
                    onChange={(e) => setPropertyId(e.target.value)}
                    required
                    disabled={isSubmitting || loadingProperties}
                    className="w-full px-4 py-3.5 bg-white border border-gray-300 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all disabled:opacity-60 disabled:bg-gray-100"
                  >
                    <option value="">Select your property</option>
                    {properties.map((prop) => (
                      <option key={prop.id} value={prop.id}>
                        {prop.name}
                        {prop.address && ` — ${prop.address}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isSubmitting}
                  className="w-full px-4 py-3.5 bg-white border border-gray-300 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all disabled:opacity-60"
                />
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-gray-700 mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isSubmitting}
                    className="w-full px-4 py-3.5 pr-12 bg-white border border-gray-300 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-200/40 transition-all disabled:opacity-60"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isSubmitting}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-teal-600 disabled:opacity-50"
                  >
                    {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || loadingProperties || !propertyId}
                className="w-full mt-3 bg-gradient-to-r from-teal-600 to-teal-700 text-white font-semibold py-3.5 rounded-xl hover:brightness-105 hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
              >
                {isSubmitting ? "Signing in..." : "Sign In"}
              </button>
            </form>

            <div className="mt-8 text-center text-sm text-gray-500">
              <p>
                Don't know which property to select?{" "}
                <span className="text-teal-600 font-medium">
                  Consult your landlord or property manager
                </span>
              </p>
            </div>
          </div>

          {/* Optional Google login - if implemented */}
          {/* <div className="px-8 sm:px-10 py-5 bg-gray-50 border-t border-gray-100 text-center">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => (window.location.href = "/api/auth/google?role=tenant")}
              className="w-full flex items-center justify-center gap-3 border border-gray-300 bg-white py-3 rounded-xl hover:bg-gray-50 transition disabled:opacity-60"
            >
              <FaGoogle className="text-red-500" />
              Continue with Google
            </button>
          </div> */}
        </motion.div>
      </div>
    </div>
  );
}