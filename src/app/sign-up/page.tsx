"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { FaEye, FaEyeSlash } from "react-icons/fa";
import Cookies from "js-cookie";
import Link from "next/link";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setIsLoading(false);
      return;
    }

    const endpoint = "/api/signup";
    const payload = { name, email, password, phone, confirmPassword, role: "propertyOwner" };

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        setError("Account created successfully! Redirecting to sign in...");
        setTimeout(() => router.push("/"), 2000);
      }
    } catch (err) {
      console.error("Submission error:", err);
      setError("Failed to connect to the server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden">
      <div className="hidden lg:flex w-1/2 bg-gradient-to-br from-dark-blue to-light-green text-foreground items-center justify-center p-10 relative overflow-hidden">
        <div className="text-center space-y-6 z-10">
          <Image
            src="/logo.png"
            alt="Smart Choice Rentals Logo"
            width={120}
            height={120}
            className="mx-auto mb-6 animate-pulse"
          />
          <h2 className="text-4xl font-extrabold tracking-wide">Smart Choice Rentals</h2>
          <p className="text-xl leading-relaxed">
            Unlock your perfect rental experience. <br />
            Join us today and find your dream home!
          </p>
        </div>
        <div className="absolute top-0 left-0 w-full h-full opacity-10 animate-pulse-slow">
          <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
            <circle cx="50" cy="50" r="40" fill="none" stroke="white" strokeWidth="1" opacity="0.3" />
            <circle cx="30" cy="30" r="10" fill="light-green" opacity="0.4" />
            <circle cx="70" cy="70" r="15" fill="light-green" opacity="0.4" />
          </svg>
        </div>
      </div>
      <div className="flex flex-col w-full lg:w-1/2 items-center justify-center bg-background px-4 py-10 lg:p-12 relative">
        <div className="w-full max-w-md bg-background shadow-2xl rounded-2xl border border-dark-blue p-6 lg:p-8 space-y-6 transform transition-all duration-300 hover:shadow-3xl">
          <div className="flex justify-center lg:hidden">
            <Image
              src="/logo.png"
              alt="Smart Choice Rentals Logo"
              width={80}
              height={80}
              className="mb-4"
            />
          </div>
          <h1 className="text-3xl lg:text-4xl font-extrabold text-center text-foreground">
            Create Your Account
          </h1>
          {error && (
            <p className="text-red-500 text-center animate-fade-in">{error}</p>
          )}
          {isLoading && (
            <div className="flex justify-center">
              <div className="w-8 h-8 border-4 border-t-4 border-accent border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border border-dark-blue rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition duration-200"
              required
            />
            <input
              type="tel"
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 border border-dark-blue rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition duration-200"
              required
            />
            <input
              type="email"
              placeholder="Email Address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-dark-blue rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition duration-200"
              required
            />
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 border border-dark-blue rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition duration-200 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-foreground hover:text-accent"
                aria-label="Toggle password visibility"
              >
                {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
              </button>
            </div>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 border border-dark-blue rounded-lg focus:outline-none focus:ring-2 focus:ring-accent transition duration-200 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-foreground hover:text-accent"
                aria-label="Toggle confirm password visibility"
              >
                {showPassword ? <FaEyeSlash size={20} /> : <FaEye size={20} />}
              </button>
            </div>
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-accent text-foreground font-semibold py-3 rounded-lg hover:bg-green-400 transition-all duration-300 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {isLoading ? "Processing..." : "Sign Up"}
            </button>
          </form>
          <p className="text-center text-sm text-foreground">
            Already have an account?{" "}
            <Link
              href="/"
              className="text-accent font-medium hover:underline transition-colors"
            >
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}