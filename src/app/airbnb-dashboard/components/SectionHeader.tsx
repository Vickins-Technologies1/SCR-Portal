"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  icon: LucideIcon;
  actions?: ReactNode;
};

export default function SectionHeader({ eyebrow, title, subtitle, icon: Icon, actions }: SectionHeaderProps) {
  return (
    <section className="glass-panel rounded-3xl p-6 sm:p-8">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 bg-primary/10 rounded-2xl flex items-center justify-center shadow-sm">
            <Icon className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{eyebrow}</p>
            <h1 className="text-xl sm:text-2xl font-semibold text-foreground">{title}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">{subtitle}</p>
          </div>
        </div>
        {actions ? <div className="flex flex-wrap gap-3">{actions}</div> : null}
      </div>
    </section>
  );
}
