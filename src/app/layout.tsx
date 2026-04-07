import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css"; 

const siteUrl = "https://app.soranapropertymanagers.com";
const siteName = "Sorana Property Managers Ltd";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: "Your trusted partner in rental success",
  applicationName: "Sorana Property Managers",
  keywords: [
    "property management",
    "rental management",
    "tenant portal",
    "property owner dashboard",
    "rent collection",
    "Kenya property management",
    "Sorana Property Managers",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: siteName,
    description: "Your trusted partner in rental success",
    url: siteUrl,
    siteName,
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/logo.png",
        width: 512,
        height: 512,
        alt: "Sorana Property Managers Logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: siteName,
    description: "Your trusted partner in rental success",
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  themeColor: "#0f172a",
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
