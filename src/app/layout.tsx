import type { Metadata, Viewport } from "next";
import "./globals.css"; 
import NativeBootstrap from "@/components/native/NativeBootstrap";

const siteUrl = "https://app.soranapropertymanagers.com";
const siteName = "Sorana";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: "Your trusted partner in rental success",
  applicationName: "Sorana",
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
        alt: "Sorana Logo",
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
  icons: {
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/icon.png", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <NativeBootstrap />
        {children}
      </body>
    </html>
  );
}
