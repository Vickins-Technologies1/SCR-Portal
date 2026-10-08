import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.soranapropertymanagers.app",
  appName: "My Accurate Rent",
  webDir: "www",
  server: {
    // Load the deployed app as Capacitor's primary origin so the native bridge
    // and custom plugins remain available after startup.
    url: "https://www.myaccuraterent.com",
    allowNavigation: ["myaccuraterent.com", "www.myaccuraterent.com"],
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
      splashImmersive: false,
    },
    SystemBars: {
      // Keep normal Android system indicators visible while retaining
      // Capacitor's Android 15-safe CSS inset handling.
      hidden: false,
      style: "DEFAULT",
      insetsHandling: "css",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
