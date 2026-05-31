"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { RefreshCw, ShieldCheck, WifiOff, Sparkles } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);

  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function getSnapshot() {
  return navigator.onLine;
}

function getServerSnapshot() {
  return true;
}

function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

function OfflineBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.2),_transparent_35%),radial-gradient(circle_at_80%_20%,_rgba(20,184,166,0.18),_transparent_28%),linear-gradient(135deg,_#020617_0%,_#0f172a_48%,_#111827_100%)]">
      <motion.div
        aria-hidden="true"
        className="absolute -left-20 top-16 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl"
        animate={{ y: [0, -18, 0], x: [0, 14, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute right-[-5rem] top-1/3 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl"
        animate={{ y: [0, 20, 0], x: [0, -10, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute bottom-[-6rem] left-1/3 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl"
        animate={{ y: [0, -14, 0], scale: [1, 1.06, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 0.75 }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(rgba(255,255,255,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.12)_1px,transparent_1px)] [background-size:72px_72px]"
      />
    </div>
  );
}

function OfflineCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative z-10 w-full max-w-2xl overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.08] shadow-[0_30px_90px_-50px_rgba(15,23,42,0.9)] backdrop-blur-2xl"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-cyan-400 via-sky-400 to-emerald-400" />

      <div className="grid gap-0 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="relative flex flex-col justify-between gap-8 p-6 sm:p-8 lg:p-10">
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/10 shadow-lg shadow-cyan-500/10">
                <WifiOff className="h-6 w-6 text-cyan-200" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.36em] text-cyan-100/70">Connection status</p>
                <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-rose-400/20 bg-rose-400/10 px-3 py-1 text-xs font-semibold text-rose-100">
                  <span className="h-2 w-2 rounded-full bg-rose-300" />
                  Offline
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <Image
                src="/logo.png"
                alt="Sorana Property Managers"
                width={180}
                height={64}
                className="h-auto w-36 drop-shadow-[0_10px_24px_rgba(34,211,238,0.18)]"
                priority
              />
              <h1 className="max-w-md text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                You’re offline, but your workspace is ready to return.
              </h1>
              <p className="max-w-lg text-sm leading-7 text-slate-300 sm:text-base">
                We’ll keep this screen ready in the background and restore the app automatically once your
                connection is back. Nothing needs to be reconfigured.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <div className="mb-3 flex items-center gap-2 text-cyan-100">
                  <ShieldCheck className="h-4 w-4" />
                  <span className="text-sm font-medium">Safe pause</span>
                </div>
                <p className="text-sm leading-6 text-slate-300">
                  Your open screens stay in place while the app waits for the network to recover.
                </p>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                <div className="mb-3 flex items-center gap-2 text-cyan-100">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm font-medium">Quick return</span>
                </div>
                <p className="text-sm leading-6 text-slate-300">
                  Tap retry after reconnecting, or the app will resume on its own.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99]"
            >
              <RefreshCw className="h-4 w-4" />
              Try again
            </button>
            <a
              href="mailto:support@soranapropertymanagers.com"
              className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10"
            >
              Contact support
            </a>
          </div>
        </div>

        <div className="relative flex items-center justify-center border-t border-white/10 bg-slate-950/30 p-6 sm:p-8 lg:border-l lg:border-t-0">
          <div className="relative min-h-[240px] h-full w-full overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.18),_transparent_38%),linear-gradient(180deg,_rgba(15,23,42,0.88),_rgba(2,6,23,0.96))] p-5">
            <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(rgba(255,255,255,0.18)_1px,transparent_1px)] [background-size:18px_18px]" />
            <div className="relative flex h-full flex-col justify-between gap-8">
              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.36em] text-cyan-100/60">Status panel</p>
                <div className="space-y-3 rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-slate-300">Internet</span>
                    <span className="rounded-full bg-rose-400/[0.15] px-3 py-1 text-xs font-semibold text-rose-100">
                      Not available
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-slate-300">App state</span>
                    <span className="rounded-full bg-emerald-400/[0.15] px-3 py-1 text-xs font-semibold text-emerald-100">
                      Kept alive
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-sm text-slate-300">Recovery</span>
                    <span className="rounded-full bg-cyan-400/[0.15] px-3 py-1 text-xs font-semibold text-cyan-100">
                      Automatic
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
                Tip: once the signal returns, this screen closes on its own and you’ll land right back where you
                left off.
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function OfflineFallback({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const isOnline = useOnlineStatus();

  return (
    <>
      {children}
      {!isOnline && (
        <div
          className="fixed inset-0 z-[9999] flex min-h-dvh items-center justify-center px-4 py-6 sm:px-6 sm:py-8"
          role="alertdialog"
          aria-modal="true"
          aria-label="No internet connection"
        >
          <OfflineBackdrop />
          <div className="relative z-10 w-full max-w-2xl text-center lg:hidden">
            <div className="mb-5 flex justify-center">
              <Image
                src="/logo.png"
                alt="Sorana Property Managers"
                width={168}
                height={60}
                className="h-auto w-36 drop-shadow-[0_10px_24px_rgba(34,211,238,0.18)]"
                priority
              />
            </div>
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.08] p-6 shadow-[0_30px_90px_-50px_rgba(15,23,42,0.9)] backdrop-blur-2xl">
              <div className="mb-4 flex justify-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.12] bg-white/10">
                  <WifiOff className="h-7 w-7 text-cyan-100" />
                </div>
              </div>
              <p className="mb-2 text-xs uppercase tracking-[0.36em] text-cyan-100/60">Connection status</p>
              <h1 className="text-3xl font-semibold tracking-tight text-white">
                No internet connection
              </h1>
              <p className="mt-4 text-sm leading-7 text-slate-300">
                We’ll keep the app ready and reconnect you automatically as soon as the network is back.
              </p>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-emerald-400 px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99]"
                >
                  <RefreshCw className="h-4 w-4" />
                  Try again
                </button>
                <a
                  href="mailto:support@soranapropertymanagers.com"
                  className="inline-flex items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition-colors duration-200 hover:bg-white/10"
                >
                  Contact support
                </a>
              </div>
            </div>
          </div>

          <div className="hidden w-full max-w-2xl lg:block">
            <OfflineCard />
          </div>
        </div>
      )}
    </>
  );
}
