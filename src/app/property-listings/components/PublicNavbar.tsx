"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Menu,
  X,
  LogIn,
  UserPlus,
  Info,
  Building2,
  Compass,
  Wallet,
  Mail,
} from "lucide-react";

const MAIN_SITE = "https://www.soranapropertymanagers.com";

const navLinks = [
  { label: "About", href: `${MAIN_SITE}/about`, icon: Info },
  { label: "Properties", href: "/property-listings", icon: Building2 },
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
          <div className="flex items-center justify-between rounded-full border border-border/60 bg-background/80 backdrop-blur-xl shadow-[0_20px_50px_-35px_rgba(30,58,138,0.6)] px-4 py-2">
            <Link href={MAIN_SITE} aria-label="Home" className="flex items-center gap-3">
              <Image
                src="/logo.png"
                alt="Sorana"
                width={56}
                height={56}
                className="h-14 w-14 object-contain"
                priority
              />
              <div className="hidden sm:block">
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Sorana</p>
                <p className="text-sm font-semibold text-foreground">Property Managers</p>
              </div>
            </Link>

            <div className="hidden lg:flex items-center gap-1 rounded-full bg-muted/60 px-2 py-2">
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground transition hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}
            </div>

            <div className="hidden lg:flex items-center gap-2">
              <Link
                href="/"
                className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-all text-muted-foreground hover:text-foreground"
              >
                <LogIn size={16} />
                Sign In
              </Link>
              <Link
                href="/sign-up"
                className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-all bg-primary text-primary-foreground shadow-[0_16px_30px_-18px_rgba(66,199,117,0.6)] hover:bg-primary-hover"
              >
                <UserPlus size={16} />
                Sign Up
              </Link>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-full bg-muted/60 hover:bg-muted transition"
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
        className={`fixed inset-y-0 left-0 z-50 w-80 rounded-r-3xl border-r border-border bg-background/95 backdrop-blur-xl shadow-[0_25px_70px_-40px_rgba(30,58,138,0.65)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden ${
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
                className="h-14 w-14 object-contain"
              />
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Sorana</p>
                <p className="text-sm font-semibold text-foreground">Property Managers</p>
              </div>
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="rounded-full p-2 hover:bg-muted transition"
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
                  className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold tracking-wide text-foreground hover:bg-muted/70 transition"
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Icon size={20} className="text-primary" />
                  </span>
                  {link.label}
                </Link>
              );
            })}
          </nav>

          <div className="space-y-3">
            <Link
              href="/"
              className="flex w-full items-center justify-between rounded-2xl border border-border px-5 py-3 text-sm font-semibold tracking-wide text-foreground transition"
              onClick={() => setMobileOpen(false)}
            >
              <span>Sign In</span>
              <LogIn size={18} />
            </Link>
            <Link
              href="/sign-up"
              className="flex w-full items-center justify-between rounded-2xl bg-primary px-5 py-3 text-sm font-semibold tracking-wide text-primary-foreground shadow-[0_14px_30px_-18px_rgba(66,199,117,0.6)]"
              onClick={() => setMobileOpen(false)}
            >
              <span>Sign Up</span>
              <UserPlus size={18} />
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
