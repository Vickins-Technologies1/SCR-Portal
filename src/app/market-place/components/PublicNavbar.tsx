"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Menu, X, LogIn, UserPlus, Info, Building2, Compass, Wallet, Mail } from "lucide-react";
import ThemeToggle from "@/components/theme/ThemeToggle";

const MAIN_SITE = "https://www.soranapropertymanagers.com";

const navLinks = [
  { label: "About", href: `${MAIN_SITE}/about`, icon: Info },
  { label: "Market Place", href: "/market-place", icon: Building2 },
  { label: "How It Works", href: `${MAIN_SITE}/how-it-works`, icon: Compass },
  { label: "Pricing", href: `${MAIN_SITE}/pricing`, icon: Wallet },
  { label: "Contact", href: `${MAIN_SITE}/contact-us`, icon: Mail },
];

export default function PublicNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <nav className="fixed top-4 left-0 right-0 z-40">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between rounded-full border border-slate-200/80 bg-white/90 backdrop-blur-xl shadow-[0_20px_50px_-35px_rgba(15,23,42,0.45)] px-4 py-2">
            <Link href={MAIN_SITE} aria-label="Home" className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Sorana"
                width={56}
                height={56}
                className="h-12 w-12 object-contain"
                priority
              />
              <div className="hidden sm:block">
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Sorana</p>
                <p className="text-xs font-semibold text-slate-900">Property Managers</p>
              </div>
            </Link>

            <div className="hidden lg:flex items-center gap-1 rounded-full bg-slate-100/80 px-2 py-2">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500 transition hover:text-slate-900"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="hidden lg:flex items-center gap-2">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] transition-all text-slate-500 hover:text-slate-900"
              >
                <LogIn size={14} />
                Sign In
              </Link>
              <div className="w-[140px]">
                <ThemeToggle className="w-full rounded-full px-4 py-2 text-[10px] uppercase tracking-[0.2em] bg-white/60 border-slate-200/80" />
              </div>
              <Link
                href="/sign-up"
                className="flex items-center gap-2 rounded-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] transition-all bg-primary text-primary-foreground shadow-[0_16px_30px_-18px_rgba(66,199,117,0.6)] hover:bg-primary-hover"
              >
                <UserPlus size={14} />
                Sign Up
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-full bg-slate-100/80 hover:bg-slate-100 transition"
              aria-label="Open menu"
            >
              <Menu size={22} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      </nav>

      <div
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-500 ${
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => setMobileOpen(false)}
        aria-hidden={!mobileOpen}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-80 rounded-r-3xl border-r border-slate-200 bg-white/95 backdrop-blur-xl shadow-[0_25px_70px_-40px_rgba(15,23,42,0.5)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden ${
          mobileOpen ? "translate-x-0 opacity-100" : "-translate-x-full opacity-0"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div className="flex h-full flex-col gap-8 p-6">
          <div className="flex items-center justify-between">
            <Link href={MAIN_SITE} className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Sorana"
                width={56}
                height={56}
                className="h-12 w-12 object-contain"
              />
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Sorana</p>
                <p className="text-xs font-semibold text-slate-900">Property Managers</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-full p-2 hover:bg-slate-100 transition"
              aria-label="Close menu"
            >
              <X size={22} />
            </button>
          </div>

          <nav className="flex-1 space-y-2">
            {navLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.label}
                  href={link.href}
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-xs font-semibold tracking-wide text-slate-900 hover:bg-slate-100/80 transition"
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                    <Icon size={18} className="text-primary" />
                  </span>
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-3">
            <Link
              href="/"
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 px-5 py-3 text-xs font-semibold tracking-wide text-slate-900 transition"
              onClick={() => setMobileOpen(false)}
            >
              <span>Sign In</span>
              <LogIn size={16} />
            </Link>
            <ThemeToggle className="rounded-2xl border-slate-200 bg-white/90" />
            <Link
              href="/sign-up"
              className="flex w-full items-center justify-between rounded-2xl bg-primary px-5 py-3 text-xs font-semibold tracking-wide text-primary-foreground shadow-[0_14px_30px_-18px_rgba(66,199,117,0.6)]"
              onClick={() => setMobileOpen(false)}
            >
              <span>Sign Up</span>
              <UserPlus size={16} />
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
