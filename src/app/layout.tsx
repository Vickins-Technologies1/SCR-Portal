import type { Metadata, Viewport } from "next";
import "./globals.css"; 
import NativeBootstrap from "@/components/native/NativeBootstrap";
import ThemeInitScript from "@/components/theme/ThemeInitScript";
import OfflineFallback from "@/components/network/OfflineFallback";
import GlobalErrorMonitor from "@/components/GlobalErrorMonitor";

const siteUrl = "https://myaccuraterent.com";
const siteName = "My Accurate Rent";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: siteName,
    template: `%s | ${siteName}`,
  },
  description: "Your trusted partner in rental success",
  applicationName: "My Accurate Rent",
  manifest: "/manifest.webmanifest",
  keywords: [
    "property management",
    "rental management",
    "tenant portal",
    "property owner dashboard",
    "rent collection",
    "Kenya property management",
    "My Accurate Rent",
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
        url: "/brand/my-accurate-rent-logo.png",
        width: 512,
        height: 512,
        alt: "My Accurate Rent logo",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: siteName,
    description: "Your trusted partner in rental success",
    images: ["/brand/my-accurate-rent-logo.png"],
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
      { url: "/favicon.ico?v=2", type: "image/x-icon" },
      { url: "/icon.png?v=2", type: "image/png", sizes: "512x512" },
    ],
    shortcut: "/favicon.ico?v=2",
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeInitScript />
      </head>
      <body className="antialiased">
        <GlobalErrorMonitor />
        <NativeBootstrap />
        <OfflineFallback>{children}</OfflineFallback>
      </body>
    </html>
  );
}
