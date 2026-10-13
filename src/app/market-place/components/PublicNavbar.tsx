import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import ThemeToggle from "@/components/theme/ThemeToggle";

const SORANA_SITE = "https://www.soranapropertymanagers.com/";

export default function PublicNavbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl">
      <nav
        aria-label="Marketplace navigation"
        className="mx-auto flex h-[68px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6"
      >
        <Link href="/market-place" aria-label="My Accurate Rent Marketplace" className="flex min-w-0 items-center gap-3">
          <Image
            src="/brand/my-accurate-rent-logo.png"
            alt=""
            width={44}
            height={44}
            className="h-10 w-10 shrink-0 object-contain"
            priority
          />
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold leading-tight text-foreground">My Accurate Rent</span>
            <span className="mt-0.5 block text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Marketplace</span>
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="hidden rounded-full px-3 py-2 text-xs font-medium text-muted-foreground transition hover:text-foreground sm:inline-flex"
          >
            Sign in
          </Link>
          <ThemeToggle variant="icon" className="h-9 w-9" />
          <a
            href={SORANA_SITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-[11px] font-semibold text-foreground transition hover:border-primary/50 hover:bg-muted sm:px-4"
          >
            Sorana Website
            <ArrowUpRight size={13} aria-hidden="true" />
          </a>
        </div>
      </nav>
    </header>
  );
}
