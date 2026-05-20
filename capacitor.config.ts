import type { CapacitorConfig } from "@capacitor/cli";

const serverUrl = (process.env.CAP_SERVER_URL || "https://app.soranapropertymanagers.com").replace(/\/$/, "");
const allowCleartext = serverUrl.startsWith("http://");

const config: CapacitorConfig = {
  appId: "com.soranapropertymanagers.portal",
  appName: "Sorana",
  webDir: "www",
  server: {
    // This project uses Next.js middleware, API route handlers, cookies, and CSRF.
    // Those require a running Next.js server, so the Capacitor wrapper loads the deployed site.
    url: serverUrl,
    cleartext: allowCleartext,
  },
  plugins: {
    CapacitorCookies: {
      enabled: true,
    },
    SplashScreen: {
      launchShowDuration: 2200,
      launchAutoHide: true,
      backgroundColor: "#0f172a",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashImmersive: true,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
