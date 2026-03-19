import type { ReactNode } from "react";
import { Sora, Cormorant_Garamond, JetBrains_Mono } from "next/font/google";
import PublicNavbar from "./components/PublicNavbar";

const sora = Sora({
  subsets: ["latin"],
  variable: "--font-sora",
  weight: ["400", "500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-cormorant",
  weight: ["400", "500", "600", "700"],
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "600"],
});

export default function PropertyListingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${sora.variable} ${cormorant.variable} ${jetbrains.variable} sorana-theme`}>
      <PublicNavbar />
      {children}
    </div>
  );
}
