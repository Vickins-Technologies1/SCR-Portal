"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash, FaGoogle } from "react-icons/fa";
import Cookies from "js-cookie";
import Link from "next/link";
import { motion } from "framer-motion";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [csrfToken, setCsrfToken] = useState<string>("");
  const [passwordStrength, setPasswordStrength] = useState<number>(0);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number>(5);
  const [isEmailTouched, setIsEmailTouched] = useState(false);
  const [isPhoneTouched, setIsPhoneTouched] = useState(false);
  const router = useRouter();

  // Fetch CSRF token
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
        const response = await fetch("/api/csrf-token", {
          method: "GET",
          credentials: "include",
        });
        const data = await response.json();
        if (data.success && data.csrfToken) {
          setCsrfToken(data.csrfToken);
        } else {
          setError("Failed to fetch CSRF token");
        }
      } catch {
        setError("Failed to fetch CSRF token");
      }
    };
    fetchCsrfToken();
  }, []);

  // Password strength calculation
  useEffect(() => {
    let strength = 0;
    if (password.length >= 8) strength += 25;
    if (/[A-Z]/.test(password)) strength += 25;
    if (/[0-9]/.test(password)) strength += 25;
    if (/[@$!%*?&]/.test(password)) strength += 25;
    setPasswordStrength(strength);
  }, [password]);

  // Redirect countdown
  useEffect(() => {
    if (successMessage && redirectCountdown > 0) {
      const timer = setInterval(() => {
        setRedirectCountdown((prev) => prev - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
    if (redirectCountdown === 0) {
      router.push("/");
    }
  }, [successMessage, redirectCountdown, router]);

  // Validate email format
  const validateEmail = (value: string) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : "Invalid email format";
  };

  // Validate phone format
  const validatePhone = (value: string) => {
    return /^(?:\+2547|7)\d{8}$/.test(value) ? null : "Invalid phone number (e.g., +2547xxxxxxxx or 07xxxxxxxx)";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // Client-side validation
    const emailError = validateEmail(email);
    const phoneError = validatePhone(phone);
    if (emailError) {
      setError(emailError);
      setIsLoading(false);
      return;
    }
    if (phoneError) {
      setError(phoneError);
      setIsLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }
    if (passwordStrength < 100) {
      setError("Password must be at least 8 characters long and include uppercase, lowercase, numbers, and special characters");
      setIsLoading(false);
      return;
    }
    if (!csrfToken) {
      setError("CSRF token is missing");
      setIsLoading(false);
      return;
    }

    const endpoint = "/api/signup";
    const payload = {
      name,
      email,
      password,
      phone,
      confirmPassword,
      role: "propertyOwner",
      csrfToken,
    };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrfToken, // Add CSRF token to header
        },
        body: JSON.stringify(payload),
        credentials: "include",
      });

      const data = await response.json();
      console.log("Signup response:", data);
      if (!data.success) {
        setError(data.message || "An error occurred");
      } else {
        if (data.userId && data.role) {
          Cookies.set("userId", data.userId, { secure: true, sameSite: "Strict", expires: 7 });
          Cookies.set("role", data.role, { secure: true, sameSite: "Strict", expires: 7 });
          console.log("Client-side cookies set:", { userId: data.userId, role: data.role });
        }
        setName("");
        setEmail("");
        setPassword("");
        setConfirmPassword("");
        setPhone("");
        setSuccessMessage(`Account created successfully! Redirecting to sign in in ${redirectCountdown} seconds...`);
      }
    } catch {
      console.error("Submission error");
      setError("Failed to connect to the server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      // Redirect to Google OAuth endpoint
      window.location.href = "/api/auth/google";
    } catch {
      console.error("Google sign-in error");
      setError("Failed to initiate Google sign-in. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-[#1E3A8A] to-[#6EE7B7] text-white items-center justify-center p-10 relative overflow-hidden">
        <div className="text-center space-y-6 z-10">
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Image
              src="/logo.png"
              alt="Smart Choice Rentals Logo"
              width={120}
              height={120}
              className="mx-auto mb-6 animate-pulse"
            />
          </motion.div>
          <motion.h2
            className="text-4xl font-extrabold tracking-wide"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            Smart Choice Rentals
          </motion.h2>
          <motion.p
            className="text-xl leading-relaxed"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            Unlock your perfect rental experience. <br />
            Join us today and manage your properties with experts!
          </motion.p>
        </div>
        <div className="absolute top-0 left-0 w-full h-full opacity-10 animate-pulse-slow">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
            <circle cx="50" cy="50" r="40" fill="none" stroke="white" strokeWidth="1" opacity="0.3" />
            <circle cx="30" cy="30" r="10" fill="#6EE7B7" opacity="0.4" />
            <circle cx="70" cy="70" r="15" fill="#6EE7B7" opacity="0.4" />
          </svg>
        </div>
      </div>
      <div className="flex flex-col w-full lg:w-1/2 items-center justify-center px-4 py-10 lg:p-12">
        <motion.div
          className="w-full max-w-md bg-white shadow-2xl rounded-2xl border border-[#1E3A8A] p-6 lg:p-8 space-y-6"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex justify-center lg:hidden">
            <Image
              src="/logo.png"
              alt="Smart Choice Rentals Logo"
              width={80}
              height={80}
              className="mb-4"
            />
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-center text-[#1E3A8A]">
            Create Your Account
          </h1>
          {(error || successMessage) && (
            <motion.p
              className={`text-center text-sm ${error ? "text-red-500" : "text-[#6EE7B7]"} animate-fade-in`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
            >
              {error || successMessage}
            </motion.p>
          )}
          {isLoading && (
            <div className="flex justify-center">
              <div className="w-8 h-8 border-4 border-t-4 border-[#6EE7B7] border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
          <motion.button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-white border border-[#1E3A8A] text-[#1E3A8A] font-semibold py-3 rounded-lg hover:bg-gray-100 transition-all duration-300 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
            initial={{ scale: 1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <FaGoogle size={20} />
            Sign Up with Google
          </motion.button>
          <div className="flex items-center justify-center gap-2">
            <hr className="w-1/4 border-[#1E3A8A]" />
            <span className="text-sm text-[#1E3A8A]">or</span>
            <hr className="w-1/4 border-[#1E3A8A]" />
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 border border-[#1E3A8A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6EE7B7] transition duration-200 text-sm"
                required
              />
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <span className="text-[#1E3A8A] text-sm">🇰🇪 +254</span>
              </div>
              <input
                type="tel"
                placeholder="7xxxxxxxx"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setIsPhoneTouched(true);
                }}
                className={`w-full pl-20 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6EE7B7] transition duration-200 text-sm ${isPhoneTouched && validatePhone(phone) ? "border-red-500" : "border-[#1E3A8A]"}`}
                required
              />
              {isPhoneTouched && validatePhone(phone) && <p className="text-red-500 text-xs mt-1">{validatePhone(phone)}</p>}
            </div>
            <div>
              <input
                type="email"
                placeholder="Email Address"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setIsEmailTouched(true);
                }}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6EE7B7] transition duration-200 text-sm ${isEmailTouched && validateEmail(email) ? "border-red-500" : "border-[#1E3A8A]"}`}
                required
              />
              {isEmailTouched && validateEmail(email) && <p className="text-red-500 text-xs mt-1">{validateEmail(email)}</p>}
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-14 border border-[#1E3A8A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6EE7B7] transition duration-200 text-sm"
                required
              />
              <div className="mt-2">
                <div className="w-full h-2 bg-gray-200 rounded-full">
                  <motion.div
                    className={`h-2 rounded-full ${passwordStrength === 100 ? "bg-[#6EE7B7]" : passwordStrength >= 50 ? "bg-yellow-400" : "bg-red-500"}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${passwordStrength}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <p className="text-xs text-[#1E3A8A] mt-1">
                  Password strength: {passwordStrength === 100 ? "Strong" : passwordStrength >= 50 ? "Medium" : "Weak"}
                </p>
              </div>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 pr-14 border border-[#1E3A8A] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6EE7B7] transition duration-200 text-sm"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-0 h-full flex items-center justify-center px-2 text-[#1E3A8A] hover:text-[#6EE7B7] transition-colors"
                aria-label="Toggle confirm password visibility"
              >
                {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
              </button>
            </div>
            <motion.button
              type="submit"
              disabled={isLoading || !csrfToken}
              className="w-full bg-[#6EE7B7] text-[#1E3A8A] font-semibold py-3 rounded-lg hover:bg-[#4ADE80] transition-all duration-300 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
              initial={{ scale: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {isLoading ? "Processing..." : "Sign Up"}
            </motion.button>
          </form>
          <p className="text-center text-sm text-[#1E3A8A]">
            Already have an account?{" "}
            <Link
              href="/"
              className="text-[#6EE7B7] font-medium hover:underline transition-colors"
            >
              Sign In
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}