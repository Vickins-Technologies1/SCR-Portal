"use client";

import type { ReactNode } from "react";

export default function PublicThemeWrapper({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`sorana-theme ${className}`}>{children}</div>
  );
}
