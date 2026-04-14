"use client";

import { useEffect, useMemo, useState } from "react";

type NavbarDateTimeProps = {
  className?: string;
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

export default function NavbarDateTime({ className }: NavbarDateTimeProps) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(new Date());
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  const labels = useMemo(() => {
    if (!now) {
      return { date: "—", time: "—" };
    }

    return {
      date: dateFormatter.format(now),
      time: timeFormatter.format(now),
    };
  }, [now]);

  return (
    <div
      className={`min-w-0 shrink-0 rounded-full border border-border/60 bg-white/70 px-2.5 py-1 text-[10px] font-medium text-muted-foreground shadow-sm sm:px-3 sm:text-xs ${
        className || ""
      }`}
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-col items-start leading-tight sm:flex-row sm:items-center">
        <span className="max-w-[180px] truncate">{labels.date}</span>
        <span className="hidden px-2 text-muted-foreground/60 sm:inline">•</span>
        <span className="max-w-[120px] truncate">{labels.time}</span>
      </div>
    </div>
  );
}
