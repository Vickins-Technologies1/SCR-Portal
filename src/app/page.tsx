"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { LayoutGrid, Store } from "lucide-react";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";
import OwnerLoginPage from "./portals/owner/page";

function detectNativePlatform(): boolean {
  if (typeof window === "undefined") return false;
  const capacitor = (window as any).Capacitor;
  if (capacitor && typeof capacitor.isNativePlatform === "function") {
    try {
      return Boolean(capacitor.isNativePlatform());
    } catch {
      return false;
    }
  }
  return false;
}

export default function EntryPage() {
  const [isNative, setIsNative] = useState<boolean>(() => detectNativePlatform());

  useEffect(() => {
    let cancelled = false;

    // Try a more reliable check (covers cases where window.Capacitor isn't ready yet).
    (async () => {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (cancelled) return;
        setIsNative(Boolean(Capacitor.isNativePlatform()));
      } catch {
        if (cancelled) return;
        setIsNative(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Keep the web app behavior unchanged: web users still see the owner sign-in page at `/`.
  if (!isNative) return <OwnerLoginPage />;

  return (
    <PublicThemeWrapper>
      <div className="min-h-[100svh] flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50/40 px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="w-full max-w-md bg-white/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden"
        >
          <div className="flex justify-center pt-10 pb-6">
            <Image
              src="/logo.png"
              alt="Sorana Property Managers"
              width={320}
              height={112}
              className="drop-shadow-xl max-w-[220px] sm:max-w-[260px]"
              priority
            />
          </div>

          <div className="px-6 pb-10 space-y-6 text-center">
            <div className="space-y-2">
              <h1 className="text-2xl font-extrabold tracking-tight bg-gradient-to-r from-blue-700 to-teal-600 bg-clip-text text-transparent">
                Welcome
              </h1>
              <p className="text-sm text-slate-600">Choose where you want to go first.</p>
            </div>

            <div className="grid gap-3">
              <Link
                href="/portals"
                className="inline-flex items-center justify-center gap-2.5 bg-gradient-to-r from-blue-600 to-teal-500 hover:from-blue-700 hover:to-teal-600 text-white font-semibold py-3.5 px-6 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl hover:brightness-105 min-h-[52px]"
              >
                <LayoutGrid size={18} />
                Portals
              </Link>

              <Link
                href="/market-place"
                className="inline-flex items-center justify-center gap-2.5 border border-teal-500/50 text-teal-800 font-semibold py-3.5 px-6 rounded-xl hover:bg-teal-50 hover:border-teal-400 transition-all duration-300 shadow-sm min-h-[52px]"
              >
                <Store size={18} className="text-teal-700" />
                Market-Place
              </Link>
            </div>

            <p className="text-xs text-slate-500">Market-Place is available without signing in.</p>
          </div>
        </motion.div>
      </div>
    </PublicThemeWrapper>
  );
}
