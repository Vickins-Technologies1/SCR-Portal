import type { ReactNode } from "react";
import type { Metadata } from "next";
import Script from "next/script";
import PublicNavbar from "./components/PublicNavbar";

export const metadata: Metadata = {
  title: "Sorana Market Place | Sorana Property Managers",
  description:
    "Browse verified long-term rentals, short-term stays, and properties for sale across Kenya. Transparent terms, verified inventory, and professional support.",
  openGraph: {
    title: "Sorana Market Place | Sorana Property Managers",
    description:
      "Browse verified long-term rentals, short-term stays, and properties for sale across Kenya. Transparent terms, verified inventory, and professional support.",
    type: "website",
    images: ["/logo.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sorana Market Place | Sorana Property Managers",
    description:
      "Browse verified long-term rentals, short-term stays, and properties for sale across Kenya. Transparent terms, verified inventory, and professional support.",
    images: ["/logo.png"],
  },
};

export default function PropertyListingsLayout({ children }: { children: ReactNode }) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;
  const metaPixelId = process.env.NEXT_PUBLIC_META_PIXEL_ID;

  return (
    <div className="sorana-theme">
      {gaId && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];\nfunction gtag(){dataLayer.push(arguments);}\ngtag('js', new Date());\ngtag('config', '${gaId}');`}
          </Script>
        </>
      )}

      {metaPixelId && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?\n            n.callMethod.apply(n,arguments):n.queue.push(arguments)};\n            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';\n            n.queue=[];t=b.createElement(e);t.async=!0;\n            t.src=v;s=b.getElementsByTagName(e)[0];\n            s.parentNode.insertBefore(t,s)}(window, document,'script',\n            'https://connect.facebook.net/en_US/fbevents.js');\n            fbq('init', '${metaPixelId}');\n            fbq('track', 'PageView');`}
        </Script>
      )}

      {metaPixelId && (
        <noscript>
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
            alt=""
          />
        </noscript>
      )}

      <PublicNavbar />
      {children}
    </div>
  );
}
