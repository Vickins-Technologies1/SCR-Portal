"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { FaArrowLeft, FaHome, FaEnvelope } from "react-icons/fa";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-gradient-to-br from-slate-50 via-white to-blue-50/40">
      {/* LEFT: Branding – hidden on mobile – bright with floating bubbles */}
      <div
        className="
          hidden lg:flex lg:w-1/2 
          bg-gradient-to-br from-white via-slate-50/70 to-white 
          text-gray-900 items-center justify-center 
          p-6 xl:p-12 relative overflow-hidden
          shadow-[-20px_0_30px_-15px_rgba(0,0,0,0.08)] 
          lg:shadow-[-30px_0_40px_-20px_rgba(0,0,0,0.10)]
        "
      >
        {/* Floating bubbles filling the section – same style as login pages */}
        <div className="absolute inset-0 pointer-events-none">
          <motion.div
            className="absolute left-[10%] top-[15%] w-20 h-20 sm:w-28 sm:h-28 rounded-full bg-teal-400/12 border border-teal-300/15 backdrop-blur-md"
            animate={{
              y: ["0%", "-40%", "10%", "-25%", "0%"],
              x: ["0%", "15%", "-10%", "8%", "0%"],
              scale: [1, 1.15, 0.92, 1.1, 1],
              opacity: [0.75, 0.95, 0.65, 0.9, 0.75],
            }}
            transition={{ duration: 23, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
          />
          <motion.div
            className="absolute right-[12%] top-[35%] w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-blue-400/14 border border-blue-300/18 backdrop-blur-sm"
            animate={{
              y: ["0%", "35%", "-20%", "15%", "0%"],
              x: ["0%", "-12%", "10%", "-6%", "0%"],
              scale: [1, 1.2, 1, 1.12, 1],
            }}
            transition={{ duration: 20, repeat: Infinity, repeatType: "reverse", ease: "easeInOut", delay: 2.5 }}
          />
          <motion.div
            className="absolute left-[38%] bottom-[25%] w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-emerald-300/10"
            animate={{
              y: ["0%", "-50%", "5%", "-35%", "0%"],
              x: ["0%", "10%", "-15%", "0%", "0%"],
              scale: [1, 1.28, 0.9, 1.18, 1],
            }}
            transition={{ duration: 27, repeat: Infinity, repeatType: "reverse", delay: 1 }}
          />
          <motion.div
            className="absolute right-[28%] bottom-[45%] w-14 h-14 rounded-full bg-teal-500/12 backdrop-blur-sm"
            animate={{
              y: ["0%", "45%", "-10%", "30%", "0%"],
              scale: [1, 1.22, 1, 1.08, 1],
            }}
            transition={{ duration: 18, repeat: Infinity, repeatType: "reverse", delay: 7 }}
          />
          <motion.div
            className="absolute left-[55%] top-[60%] w-12 h-12 sm:w-18 sm:h-18 rounded-full bg-blue-500/10"
            animate={{
              y: ["0%", "-55%", "20%", "-40%", "0%"],
              x: ["0%", "-18%", "12%", "0%", "0%"],
            }}
            transition={{ duration: 22, repeat: Infinity, repeatType: "reverse", delay: 9 }}
          />
          <motion.div
            className="absolute left-[25%] bottom-[65%] w-20 h-20 rounded-full bg-emerald-400/9 border border-emerald-200/12 backdrop-blur-lg"
            animate={{
              y: ["0%", "25%", "-45%", "8%", "0%"],
              scale: [1, 1.18, 0.93, 1.07, 1],
            }}
            transition={{ duration: 25, repeat: Infinity, repeatType: "reverse", delay: 4 }}
          />

          {/* Small filler bubbles for density */}
          <div className="absolute inset-0 opacity-45 pointer-events-none">
            <div className="absolute top-[20%] left-[48%] w-7 h-7 rounded-full bg-teal-400/22" />
            <div className="absolute top-[50%] right-[40%] w-6 h-6 rounded-full bg-blue-400/28" />
            <div className="absolute bottom-[30%] left-[65%] w-9 h-9 rounded-full bg-emerald-300/18" />
            <div className="absolute bottom-[55%] right-[55%] w-8 h-8 rounded-full bg-teal-300/20" />
            <div className="absolute top-[75%] left-[30%] w-10 h-10 rounded-full bg-blue-300/15" />
          </div>
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
            className="text-5xl sm:text-6xl xl:text-7xl font-extrabold tracking-tight bg-gradient-to-r from-teal-700 via-teal-600 to-blue-600 bg-clip-text text-transparent"
          >
            404
          </motion.h2>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.9 }}
            className="text-base sm:text-lg xl:text-xl font-light text-gray-700 leading-relaxed max-w-md mx-auto"
          >
            Page not found
          </motion.p>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
            className="text-sm sm:text-base xl:text-lg font-medium text-teal-700 tracking-wide"
          >
            The page you’re looking for doesn’t exist or has been moved.
          </motion.p>
        </div>
      </div>

      {/* RIGHT: Main content – consistent card style */}
      <div className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12 md:py-16 bg-gradient-to-b from-white/70 to-slate-50/50">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
          className="w-full max-w-md sm:max-w-lg bg-white/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden"
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

          <div className="px-5 xs:px-6 sm:px-10 pt-5 sm:pt-6 pb-8 sm:pb-10 space-y-6 text-center">
            <motion.h1
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.7 }}
              className="text-4xl xs:text-5xl sm:text-6xl font-extrabold bg-gradient-to-r from-blue-700 to-teal-600 bg-clip-text text-transparent"
            >
              Oops! 404
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35, duration: 0.8 }}
              className="text-slate-600 text-base sm:text-lg md:text-xl leading-relaxed"
            >
              Looks like this page wandered off the property map.
            </motion.p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center pt-4">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-semibold py-3.5 px-7 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:brightness-105 group text-base sm:text-lg min-h-[52px]"
              >
                <FaHome className="group-hover:scale-110 transition-transform" />
                Owner Portal
              </Link>

              <Link
                href="/tenant-login"
                className="inline-flex items-center justify-center gap-2.5 border border-teal-500/50 text-teal-700 font-semibold py-3.5 px-7 rounded-xl hover:bg-teal-50 hover:border-teal-400 hover:text-teal-800 transition-all duration-300 shadow-sm group text-base sm:text-lg min-h-[52px]"
              >
                <FaArrowLeft className="group-hover:-translate-x-1 transition-transform" />
                Tenant Portal
              </Link>
            </div>

            <div className="pt-6 border-t border-slate-100">
              <p className="text-sm text-slate-500 flex items-center justify-center gap-2">
                <FaEnvelope className="text-teal-600" />
                Need help? Contact support at{" "}
                <a
                  href="mailto:support@soranapropertymanagers.com"
                  className="text-teal-600 font-medium hover:underline hover:text-teal-700 transition-colors"
                >
                  support@soranapropertymanagers.com
                </a>
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}