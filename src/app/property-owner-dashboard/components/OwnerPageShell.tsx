"use client";

import type { ReactNode } from "react";
import Navbar from "./Navbar";
import Sidebar from "./Sidebar";

export default function OwnerPageShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Navbar />
      <Sidebar />
      <div className="md:ml-72 pt-16 pb-10 px-4 sm:px-6 lg:px-8">
        {children}
      </div>
    </>
  );
}
