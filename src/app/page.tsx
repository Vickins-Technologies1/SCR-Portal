"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaArrowRight } from "react-icons/fa";
import Cookies from "js-cookie";

export default function LoginPage() {
  const [isTenantPortal, setIsTenantPortal] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isDemo, setIsDemo] = useState(false); // Added for client-side demo check
  const router = useRouter();

  // DEMO AUTO-FILL + isDemo detection
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const demo = params.get("demo");
    setIsDemo(params.has("demo")); // Set isDemo safely on client

    const clickSubmit = () =>
      (document.querySelector('button[type="submit"]') as HTMLButtonElement | null)?.click();

    if (demo === "owner") {
      setEmail("demo@admin.com");
      setPassword("Demo@2025!");
      setIsTenantPortal(false);
      setTimeout(clickSubmit, 200);
    }
    if (demo === "tenant") {
      setEmail("tenant@demo.com");
      setPassword("Tenant@2025!");
      setIsTenantPortal(true);
      setTimeout(clickSubmit, 200);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const payload = {
      email,
      password,
      role: isTenantPortal ? "tenant" : "propertyOwner",
    };

    try {
      const res = await fetch("/api/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Login failed");

      Cookies.set("userId", data.userId, { secure: true, sameSite: "Strict", expires: 7 });
      Cookies.set("role", data.role, { secure: true, sameSite: "Strict", expires: 7 });

      router.push(data.redirect || "/dashboard");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden bg-gradient-to-br from-gray-50 to-blue-50">
      {/* Left: Branding */}
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-blue-900 to-teal-600 text-white items-center justify-center p-10 relative">
        <div className="text-center space-y-8 z-10">
          <Image src="/logo.png" alt="Logo" width={140} height={140} className="mx-auto drop-shadow-2xl" />
          <h2 className="text-5xl font-black tracking-tight">Smart Choice Rentals</h2>
          <p className="text-xl opacity-90">Instant access. Zero hassle. Real results.</p>
          <div className="pt-6">
            <a
              href="https://smartchoicerentalmanagement.com"
              className="inline-flex items-center gap-2 bg-white/20 backdrop-blur px-6 py-3 rounded-full hover:bg-white/30 transition"
            >
              Visit Homepage <FaArrowRight />
            </a>
          </div>
        </div>
        <div className="absolute inset-0 opacity-20">
          <svg className="w-full h-full" viewBox="0 0 200 200">
            <circle cx="100" cy="100" r="80" fill="none" stroke="white" strokeWidth="2" />
            <circle cx="60" cy="60" r="20" fill="white" opacity="0.3" />
            <circle cx="140" cy="140" r="25" fill="white" opacity="0.3" />
          </svg>
        </div>
      </div>

      {/* Right: Login Form */}
      <div className="flex flex-col w-full lg:w-1/2 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-blue-200 p-8 space-y-8">
          {/* Mobile Logo */}
          <div className="flex justify-center lg:hidden">
            <Image src="/logo.png" alt="Logo" width={90} height={90} />
          </div>

          {/* Demo Banner */}
          {isDemo && (
            <div className="p-4 bg-gradient-to-r from-blue-500 to-teal-500 text-white rounded-xl text-center font-bold animate-pulse">
              DEMO MODE ACTIVE — Welcome aboard!
            </div>
          )}

          <div className="text-center">
            <h1 className="text-4xl font-extrabold text-blue-900">
              {isTenantPortal ? "Tenant Portal" : "Property Owner"} Login
            </h1>
            <p className="text-gray-600 mt-2">Enter your credentials to continue</p>
          </div>

          {error && (
            <p className="p-3 bg-red-100 text-red-700 rounded-lg text-center animate-fade-in">{error}</p>
          )}

          {/* Portal Switch */}
          <div className="text-center">
            <button
              type="button"
              onClick={() => setIsTenantPortal(!isTenantPortal)}
              className="text-teal-600 font-semibold hover:underline"
            >
              {isTenantPortal ? "Switch to Owner Login" : "Switch to Tenant Portal"}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-5 py-4 border-2 border-blue-200 rounded-xl focus:border-teal-500 focus:ring-4 focus:ring-teal-100 transition"
              required
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-5 py-4 border-2 border-blue-200 rounded-xl focus:border-teal-500 focus:ring-4 focus:ring-teal-100 transition pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-teal-600"
              >
                {showPassword ? <FaEyeSlash size={22} /> : <FaEye size={22} />}
              </button>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-blue-600 to-teal-500 text-white font-bold py-4 rounded-xl hover:from-blue-700 hover:to-teal-600 transform hover:scale-105 transition disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {isLoading ? (
                <>Processing...</>
              ) : (
                <>
                  {isTenantPortal ? "Tenant Login" : "Owner Login"} <FaArrowRight />
                </>
              )}
            </button>
          </form>

          <p className="text-center text-gray-600">
            New here?{" "}
            <a href="/sign-up" className="text-teal-600 font-bold hover:underline">
              Sign Up Free
            </a>
          </p>

          {/* Demo Buttons */}
          <div className="pt-6 space-y-3 border-t border-gray-200">
            <p className="text-center text-sm font-medium text-gray-500">Try instantly:</p>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="?demo=owner"
                className="block text-center bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
              >
                Owner Demo
              </a>
              <a
                href="?demo=tenant"
                className="block text-center bg-teal-600 text-white py-3 rounded-lg hover:bg-teal-700 transition font-semibold"
              >
                Tenant Demo
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}