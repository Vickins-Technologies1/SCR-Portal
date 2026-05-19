"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Building2, Shield, UserRound, WalletCards } from "lucide-react";
import PublicThemeWrapper from "@/components/PublicThemeWrapper";

const portalCards = [
  {
    title: "Owner Portal",
    description: "Property owners & managers",
    href: "/portals/owner",
    icon: Building2,
  },
  {
    title: "Tenant Portal",
    description: "Tenants & rental payments",
    href: "/tenant-login",
    icon: WalletCards,
  },
  {
    title: "Guest Payment Portal",
    description: "Airbnb guest payments",
    href: "/airbnb-tenant-login",
    icon: UserRound,
  },
  {
    title: "Admin Portal",
    description: "Admin access",
    href: "/admin/login",
    icon: Shield,
  },
];

export default function PortalsPage() {
  return (
    <PublicThemeWrapper>
      <div className="min-h-[100svh] bg-gradient-to-br from-slate-50 via-white to-blue-50/40 px-4 py-10">
        <div className="mx-auto w-full max-w-4xl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            className="bg-white/80 backdrop-blur-2xl rounded-2xl shadow-2xl border border-slate-200/60 overflow-hidden"
          >
            <div className="px-6 sm:px-10 pt-10 pb-8 text-center space-y-3">
              <Image
                src="/logo.png"
                alt="Sorana Property Managers"
                width={320}
                height={112}
                className="mx-auto drop-shadow-xl max-w-[220px] sm:max-w-[260px]"
                priority
              />
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-700 to-teal-600 bg-clip-text text-transparent">
                Portals
              </h1>
              <p className="text-sm text-slate-600">Select the portal you want to access.</p>
            </div>

            <div className="px-6 sm:px-10 pb-10">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {portalCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <Link
                      key={card.title}
                      href={card.href}
                      className="group rounded-2xl border border-slate-200 bg-white/70 hover:bg-white transition-all duration-300 shadow-sm hover:shadow-md p-5 flex items-center gap-4"
                    >
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                        <Icon size={22} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-extrabold text-slate-900">{card.title}</p>
                        <p className="text-xs text-slate-600">{card.description}</p>
                      </div>
                      <ArrowRight
                        size={18}
                        className="text-slate-400 group-hover:text-slate-700 group-hover:translate-x-0.5 transition-all"
                      />
                    </Link>
                  );
                })}
              </div>

              <div className="pt-6 text-center">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 text-sm font-semibold text-teal-700 hover:text-teal-800 hover:underline"
                >
                  Back to home
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </PublicThemeWrapper>
  );
}

