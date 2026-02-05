"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { FaArrowLeft, FaHome } from "react-icons/fa";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-blue-50/30">
      {/* Left: Decorative / Branding section – hidden on mobile */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-indigo-950 via-blue-950 to-teal-950 text-white items-center justify-center p-6 xl:p-12 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <motion.div
            className="absolute w-64 h-64 rounded-full bg-gradient-to-br from-teal-400/20 to-cyan-300/10 blur-3xl"
            initial={{ x: "-10%", y: "50%", scale: 1 }}
            animate={{ x: ["-10%", "20%", "-5%"], y: ["50%", "10%", "60%"], scale: [1, 1.1, 1] }}
            transition={{ duration: 20, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
          <motion.div
            className="absolute w-80 h-80 rounded-full bg-gradient-to-br from-cyan-300/12 to-teal-200/6 blur-2xl"
            initial={{ x: "60%", y: "-20%", scale: 0.95 }}
            animate={{ x: ["60%", "35%", "70%"], y: ["-20%", "15%", "-35%"], scale: [0.95, 1.05, 0.95] }}
            transition={{ duration: 24, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 5 }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-indigo-950/20" />
        </div>

        <div className="text-center space-y-6 xl:space-y-9 z-10 max-w-lg">
          <motion.div
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="bg-white/90 backdrop-blur-md rounded-2xl p-5 sm:p-6 shadow-2xl border border-white/25 inline-block"
          >
            <Image
              src="/logo.png"
              alt="Sorana"
              width={300}
              height={110}
              className="mx-auto drop-shadow-2xl max-w-[260px] sm:max-w-[300px]"
              priority
            />
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.8 }}
            className="text-5xl sm:text-6xl xl:text-7xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-200 via-cyan-100 to-teal-200"
          >
            404
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-xl sm:text-2xl font-light opacity-90"
          >
            Page not found
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55, duration: 0.8 }}
            className="text-lg sm:text-xl opacity-80 leading-relaxed px-4 max-w-md mx-auto"
          >
            The page you’re looking for doesn’t exist or has been moved.
          </motion.p>
        </div>
      </div>

      {/* Right: Main content – form-like card */}
      <div className="flex-1 flex items-center justify-center min-h-screen lg:min-h-0 px-5 py-12 sm:px-8 md:px-12 lg:p-12 bg-white/40 lg:bg-gradient-to-b lg:from-transparent lg:to-white/30">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="w-full max-w-md sm:max-w-lg bg-white/80 backdrop-blur-xl rounded-2xl sm:rounded-3xl shadow-2xl border border-white/30 overflow-hidden p-6 sm:p-10 text-center"
        >
          {/* Mobile logo */}
          <div className="flex justify-center lg:hidden mb-8">
            <Image
              src="/logo.png"
              alt="Sorana"
              width={180}
              height={70}
              className="drop-shadow-md max-w-[220px] w-full"
              priority
            />
          </div>

          <motion.h1
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.7 }}
            className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-blue-700 to-teal-600 bg-clip-text text-transparent mb-4"
          >
            Oops! 404
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35 }}
            className="text-gray-600 text-lg sm:text-xl mb-8 leading-relaxed"
          >
            Looks like this page wandered off the property map.
          </motion.p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 via-teal-500 to-teal-600 text-white font-semibold py-3.5 px-8 rounded-xl hover:brightness-110 hover:shadow-xl transition-all duration-300 shadow-md group text-base sm:text-lg min-h-[52px]"
            >
              <FaHome className="group-hover:scale-110 transition-transform" />
              Owner Login
            </Link>

            <Link
              href="/tenant-login"
              className="inline-flex items-center justify-center gap-2 border border-teal-500/40 text-teal-700 font-semibold py-3.5 px-8 rounded-xl hover:bg-teal-50 hover:border-teal-400 hover:text-teal-800 transition-all duration-300 shadow-sm min-h-[52px] text-base sm:text-lg"
            >
              <FaArrowLeft className="group-hover:-translate-x-1 transition-transform" />
              Tenant Dashboard
            </Link>
          </div>

          <p className="mt-10 text-sm text-gray-500">
            Need help? Contact support at{" "}
            <a
              href="mailto:support@soranapropertymanagers.com"
              className="text-teal-600 hover:underline font-medium"
            >
              support@soranapropertymanagers.com
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}